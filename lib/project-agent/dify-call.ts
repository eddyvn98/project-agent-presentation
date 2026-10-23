import type { DifyChatFile } from "./dify-input-files";
import { readDifyAgentMessage, type DifyAgentMessage, type DifyProgressCallback } from "./dify-stream";
import { applyEditSpec, type EditSpec } from "./edit-files";
import { buildRichFiles, extractRichFileSpecs, stripUnverifiedDisclaimers } from "./rich-files";
import { downloadOfficeToolFiles } from "./office-tools";
import { readProjectAgentTaskInputFile } from "./task-store";
import { PROJECT_AGENT_DIFY_CALL_TIMEOUT_MS } from "./timeouts";

/** One streamed call to the Dify Project Agent app (the classic, non-sandbox path): builds any ong-file specs the answer carries and downloads Office Tools files. */
export async function callDifyAgent(input: {
	endpoint: string;
	apiKey: string;
	user: string;
	query: string;
	files: DifyChatFile[];
	conversationId?: string;
	signal?: AbortSignal;
	onPartial?: DifyProgressCallback;
	editSources?: { taskId: string; files: Array<{ id: string; name: string }> };
}): Promise<DifyAgentMessage> {
	const response = await fetch(input.endpoint, {
		method: "POST",
		headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
		body: JSON.stringify({
			inputs: {}, query: input.query, response_mode: "streaming", user: input.user, files: input.files,
			...(input.conversationId ? { conversation_id: input.conversationId } : {}),
		}),
		cache: "no-store",
		signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(PROJECT_AGENT_DIFY_CALL_TIMEOUT_MS)]) : AbortSignal.timeout(PROJECT_AGENT_DIFY_CALL_TIMEOUT_MS),
	});
	if (!response.ok) {
		const raw = await response.text().catch(() => "");
		throw new Error(`Dify Project Agent returned HTTP ${response.status}${raw ? `: ${raw.slice(0, 240)}` : ""}`);
	}
	const message = await readDifyAgentMessage(response, input.onPartial);
	const rich = extractRichFileSpecs(message.answer);
	if (rich.specs.length > 0) {
		const built = await buildRichFiles(rich.specs);
		const changeLog: string[] = [];
		for (const spec of rich.specs.filter((item) => String(item.type).toLowerCase() === "edit")) {
			try {
				const wanted = String((spec as EditSpec).source ?? "").toLowerCase();
				const source = input.editSources?.files.find((file) => file.name.toLowerCase() === wanted) ?? (input.editSources?.files.length === 1 ? input.editSources.files[0] : undefined);
				if (!source || !input.editSources) { built.errors.push(`edit: source file "${wanted.slice(0, 80)}" is not attached`); continue; }
				const original = await readProjectAgentTaskInputFile(input.editSources.taskId, source.id);
				const edited = await applyEditSpec(spec as EditSpec, { name: source.name, bytes: new Uint8Array(original) });
				built.files.push({ name: edited.name, bytes: edited.bytes });
				changeLog.push(`Changes made to ${source.name} (saved as ${edited.name}):`, ...edited.summary.map((line) => `- ${line}`), ...edited.warnings.map((line) => `- Not applied: ${line}`));
			} catch (error) {
				built.errors.push(`edit: ${error instanceof Error ? error.message : "failed"}`.slice(0, 200));
			}
		}
		const known = new Set(message.inlineFiles.map((file) => file.name));
		message.inlineFiles = [...message.inlineFiles, ...built.files.filter((file) => !known.has(file.name))];
		message.answer = [stripUnverifiedDisclaimers(rich.text) || "Generated the requested file(s).", changeLog.join("\n")].filter(Boolean).join("\n\n");
		if (built.errors.length > 0) message.answer += `\n\nThe app could not build part of the file spec (${built.errors.join("; ")}). Fix the JSON and send the ong-file block again.`;
	}
	if (message.officeLinks?.length) {
		const officeFiles = await downloadOfficeToolFiles(message.officeLinks).catch(() => []);
		if (officeFiles.length > 0) {
			const known = new Set(message.inlineFiles.map((file) => file.name));
			message.inlineFiles = [...message.inlineFiles, ...officeFiles.filter((file) => !known.has(file.name))];
			// The Office Tools service already recalculated, linted and rendered these files in the same call.
			message.officeVerified = officeFiles.length === message.officeLinks.length && !message.officeFailedCalls;
		}
	}
	return message;
}
