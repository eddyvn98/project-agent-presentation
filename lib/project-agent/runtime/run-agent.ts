import { assertActiveTaskLease } from "../lease-fence"; import { runCalculationStep } from "./calculate"; import { auditFinalAnswer } from "./final-audit"; import { checkG1SyntheticGoal, formatG1Receipt, g1QaActionAllowed } from "./g1-goal-check"; import { enforceTaskBudget, estimatedModelCost } from "./usage-pricing";
import { agentScheduleAction } from "../scheduled-agent-tool"; import { agentWorkflowAction } from "../workflow-agent-tool";
import { contextOutputAction, externalizeActionOutput } from "./context-output-manager"; import { runXerjAction } from "../xerj/runtime-action";
import { recordContextCheckpoint } from "./context-checkpoint"; import { RuntimeTurnContext } from "./turn-context";
import fs from "node:fs/promises"; import path from "node:path";
import type { DifyAgentMessage } from "../dify-stream";
import type { DifyChatFile } from "../dify-input-files";
import { estimateContextTokens } from "../context-meter"; import { takeSteerNotes } from "./steer";
import { parseRuntimeActions, plainAnswerAsFinal, type RuntimeAction } from "./actions"; import { COMPACT_AT_PROMPT_TOKENS, compactConversation } from "./compact";
import { saveScriptsOut } from "./library"; import { generateImages } from "./image-module"; import { VerificationGate } from "./verify"; import { DeliverableEvaluator } from "./evaluator";
import { analyzeTrajectory, spanKey, trajectoryLine, writeTrace, type Span } from "./trace";
import { redactSecrets, withPolicy } from "./policy";
import { webFetch } from "./web-fetch"; import { renderFileId } from "../render-ids";
import { writeProjectAgentFile } from "../task-store";
import { callRuntimeModel, isConversationLostError, uploadRuntimeImage, type RuntimeModelReply } from "./model";
import { restartAfterLoss } from "./lost-conversation";
import { webSearch } from "./web-search";
import { workspaceRead } from "./workspace-engine";
import { initialWorkspacePrompt, runDirectWorkspace } from "./workspace-direct"; import { inputPhotoSheets } from "./input-photos";
import { newDirectState } from "./workspace-direct-apply";
import { engineRefusal } from "./engines";
import { delegateToSubAgent } from "./sub-agent";
import { uniqueParallelJobs } from "./delegate-batch"; import { hasVerifiedMilestone } from "./progress-evidence"; import { StallGuard, wrapUpQuery } from "./stall-guard"; import { ActionReplayGuard, mayHaveExternalEffects } from "./action-replay-guard"; import { checkHtmlPage, newOutputFiles, storeWorkbookValues } from "./outputs";
import { isLargePdfOutput, storeLargePdfOutput } from "./large-output";
import { render } from "./render-action"; import { execInSandbox, resolveWorkspacePath, workspaceDir } from "./sandbox";
import { recordSources } from "./source-collector";
import { referenceAction } from "./reference-action";
import { runPdfForTask } from "./pdf-action";
import { runPlanAction } from "./plan-action";
import { runWait } from "./wait-action";
import { prefetchReference } from "./reference-prefetch";
import { proposeTaskReference } from "./reference-candidates";
import { runBrowserAction } from "./browser-agent"; import { finishProjectAgent } from "./browser-agent/project-sessions";
import { closeBrowserSession } from "./browser-agent/session"; import { clearBrowserControl, browserControlState } from "./browser-agent/control"; import { finalizeP8BrowserLoop } from "./browser-agent/loop-finalize"; import { resumedBrowserContext, browserPlanOutdated } from "./browser-agent/handback";
import { transcribeTables } from "./table-transcribe";
import type { ProjectAgentTaskSource } from "../types";
import type { RuntimeInput } from "./run-agent-types";
export type { RuntimeInput, RuntimeStep } from "./run-agent-types";
const MAX_STEPS = 60, MAX_INVALID_REPLIES = 3;
const DEADLINE_MS = 25 * 60_000, MAX_IMAGE_CALLS = 5;
const MAX_DELEGATES = 3, SUB_AGENT_STEPS = 25, MAX_FILE_BYTES = 40 * 1024 * 1024;
export const isRuntimeEnabled = () => process.env.PROJECT_AGENT_RUNTIME === "sandbox";
async function runAction(input: RuntimeInput, action: Exclude<RuntimeAction, { action: "final" }>, loopStep: number, imageCalls: { value: number }, budget: { delegates: number }): Promise<{ text: string; rawOutput?: string; image?: DifyChatFile; images?: DifyChatFile[]; failed?: boolean; sources?: ProjectAgentTaskSource[] }> {
	const step = loopStep + (input.depth ? 100 * ((input.slot ?? 0) + 1) : 0); if (!g1QaActionAllowed(input, action)) return { text: "G1 QA permits only synthetic DOM snapshot/click actions", failed: true };
	if (!input.depth && action.note && action.action !== "progress") input.onStep?.({ tool: "progress_message", detail: redactSecrets(action.note).replace(/\s+/g, " ").trim().slice(0, 200) });
	if (action.action === "progress") { if (!input.depth) input.onStep?.({ tool: "progress_message", detail: redactSecrets(action.message) }); return { text: "Progress note shown to user; continue with the actions needed for the request." }; }
	if (action.action === "calculate") return runCalculationStep(action.expression, input.onStep); if (action.action === "schedule") return agentScheduleAction(input, action); if (action.action === "workflow") return agentWorkflowAction(input, action);
	if (action.action === "search_output" || action.action === "read_output") return contextOutputAction(input, action); if (action.action === "xerj_search" || action.action === "xerj_read") return runXerjAction(input, action);
	if (action.action === "shell") {
		input.onStep?.({ tool: "sandbox_shell", detail: action.note || action.command });
		const result = await execInSandbox(input.chatId, action.command, action.timeout, input.readOnly);
		return { text: `shell result (exit ${result.exitCode}${result.timedOut ? ", timed out" : ""}):\n${result.output}`, rawOutput: `shell result (exit ${result.exitCode}${result.timedOut ? ", timed out" : ""}):\n${result.fullOutput ?? result.output}`, failed: result.exitCode !== 0 };
	}
	if (action.action === "write_file") {
		input.onStep?.({ tool: "sandbox_write", detail: action.note || action.path });
		try {
			const target = resolveWorkspacePath(input.chatId, action.path);
			await fs.mkdir(path.dirname(target), { recursive: true });
			await fs.writeFile(target, action.content);
			return { text: `Wrote ${action.path} (${action.content.length} characters).` };
		} catch (cause) { return { text: `write_file failed: ${cause instanceof Error ? cause.message : "error"}`, failed: true }; }
	}
	if (action.action === "generate_image") {
		const refusal = engineRefusal(input.engines, "generate_image");
		if (refusal) return { text: refusal, failed: true };
		if (imageCalls.value >= MAX_IMAGE_CALLS) return { text: `Image generation is limited to ${MAX_IMAGE_CALLS} calls per task.`, failed: true };
		imageCalls.value += 1;
		input.onStep?.({ tool: "generate_image", detail: action.note || action.prompt });
		return generateImages(input.chatId, input.user, action, input.signal, input.ownerEmail);
	}
	if (action.action === "transcribe_tables") return transcribeTables(input, action);
	if (action.action === "delegate") return delegateToSubAgent(runRuntimeAgent, input, action, budget, MAX_DELEGATES, SUB_AGENT_STEPS);
	if (action.action === "workspace_commands" || action.action === "workspace_view" || action.action === "workspace_apply") return runDirectWorkspace(input, action);
	if (action.action === "workspace_read") {
		const refusal = engineRefusal(input.engines, action.action);
		if (refusal) return { text: refusal, failed: true };
		if (!input.ownerEmail) return { text: "The Workspace engine is not available here.", failed: true };
		return workspaceRead(input.chatId, input.ownerEmail, { boardId: action.board });
	}
	if (action.action === "web_search") {
		input.onStep?.({ tool: "web_search", detail: action.note || action.queries?.join("; ") || action.query || "" });
		return webSearch(action.queries?.length ? action.queries : action.query ?? "", input.signal, { recency: action.recency, lang: action.lang });
	}
	if (action.action === "web_fetch") {
		input.onStep?.({ tool: "web_fetch", detail: action.note || action.url });
		const result = await webFetch(action.url, input.signal, { chatId: input.chatId, offset: action.offset, find: action.find });
		const source = result.sources?.[0];
		if (source) await proposeTaskReference(source.title, source.url, result.text).catch(() => {});
		return result;
	}
	if (action.action === "browser") return runBrowserAction(input, action, step);
	if (action.action === "pdf") return runPdfForTask(input, action);
	if (action.action === "plan") return runPlanAction(input, action);
	if (action.action === "wait") { input.onStep?.({ tool: "wait", detail: action.note || (action.until ? `until ${action.until}` : `${action.seconds} s`) }); return runWait({ chatId: input.chatId, signal: input.signal, readOnly: input.readOnly, waited: (input.budget ??= { delegates: 0 }).waited ??= { seconds: 0 } }, action); }
	if (action.action === "reference") {
		input.onStep?.({ tool: "reference", detail: action.note || action.query || action.id || "" });
		return referenceAction(action);
	}
	input.onStep?.({ tool: `render_pages #render-${step}`, detail: action.note || action.path });
	try {
		const rendered = await render(input.chatId, input.taskId, input.user, action.path, action.pages ?? "sample", step, action.region);
		return { text: rendered.text, image: rendered.image, failed: !rendered.image };
	} catch (cause) { return { text: `render failed: ${cause instanceof Error ? cause.message : "error"}`, failed: true }; }
}interface RunMetrics { failed: number; modelMs: number; actionMs: number; referenceMs: number; rounds: number; promptTokens: number; stepTokens: number[]; stepOut: number[]; compactions: number; invalid: number; actions: Map<string, number> }
/** The app-hosted agent loop: the model proposes actions, the app runs them in the chat's sandbox and replies with the results. Logs one metrics line per run, even when it fails. */
export async function runRuntimeAgent(input: RuntimeInput): Promise<DifyAgentMessage> {
	const started = Date.now();
	input.workspaceState ??= newDirectState();
	input.sources ??= [];
	input.trace ??= [];
	input.contextStats ??= { captures: 0, storedBytes: 0, returnedBytes: 0 };
	const metrics: RunMetrics = { failed: 0, modelMs: 0, actionMs: 0, referenceMs: 0, rounds: 0, promptTokens: 0, stepTokens: [], stepOut: [], compactions: 0, invalid: 0, actions: new Map() };
	try { return await loop(input, metrics); } finally {
		if (!input.depth) {
			input.onStep?.({ tool: "trajectory", detail: trajectoryLine(analyzeTrajectory(input.trace!)) });
			if (input.taskId) await writeTrace(input.taskId, input.trace!);
			if (input.taskId) clearBrowserControl(input.taskId); if (input.projectId && input.ownerEmail) await finishProjectAgent(input.projectId, input.ownerEmail, input.taskId).catch(() => {}); await closeBrowserSession(input.taskId ?? input.chatId).catch(() => {}); await finalizeP8BrowserLoop(input.taskId, input.onStep);
		}
		const seconds = (ms: number) => Math.round(ms / 1000);
		input.onStep?.({ tool: "metrics", detail: `total_s=${seconds(Date.now() - started)} model_s=${seconds(metrics.modelMs)} action_s=${seconds(metrics.actionMs)} reference_ms=${metrics.referenceMs} steps=${metrics.rounds} prompt_tokens=${metrics.promptTokens} step_tokens=${metrics.stepTokens.slice(0, 30).join("/")} out_max=${Math.max(0, ...metrics.stepOut)} out_total=${metrics.stepOut.reduce((a, b) => a + b, 0)} step_out=${metrics.stepOut.slice(0, 30).join("/")} compactions=${metrics.compactions} invalid=${metrics.invalid} failed=${metrics.failed} context_captures=${input.contextStats?.captures ?? 0} context_kept_bytes=${input.contextStats?.storedBytes ?? 0} context_returned_bytes=${input.contextStats?.returnedBytes ?? 0} model=${input.modelSelector || "default"} cost_usd=${estimatedModelCost(input.modelSelector || "default", metrics.promptTokens, metrics.stepOut.reduce((n,v)=>n+v,0))?.toFixed(6) ?? "unknown"} tools=${[...metrics.actions].map(([name, count]) => `${name}:${count}`).join(",") || "none"}${input.subUsage ? ` sub_runs=${input.subUsage.runs} sub_steps=${input.subUsage.steps} sub_tokens=${input.subUsage.tokens} sub_models=${[...input.subUsage.models].join(",")}` : ""}` });
	}
}
async function loop(input: RuntimeInput, metrics: RunMetrics): Promise<DifyAgentMessage> {
	const started = Date.now();
	let conversationId = input.conversationId;
	let query = input.query;
	const referenceStarted = Date.now();
	const reference = await prefetchReference(input.query);
	metrics.referenceMs += Date.now() - referenceStarted;
	if (reference) {
		input.onStep?.({ tool: "reference", detail: input.query.slice(0, 160) });
		metrics.actions.set("reference", (metrics.actions.get("reference") ?? 0) + 1);
		recordSources(input.sources!, reference.sources);
		query = `${query}\n\n${reference.text}`;
	}
	const workspaceContext = await initialWorkspacePrompt(input);
	if (workspaceContext) query = `${query}\n\n${workspaceContext}`; if (input.projectId && input.ownerEmail && process.env.PROJECT_AGENT_STEEL_BROWSER === "1") query += "\n\nUse the Project shared browser for browser actions; the Agent can open it if necessary. Start by taking a fresh snapshot of the user tab.";
	let images: DifyChatFile[] = [];
	if (!conversationId && !input.depth) {
		const photos = await inputPhotoSheets(input.chatId, input.user).catch(() => null);
		if (photos?.images.length) { images = photos.images; query = `${query}\n\n${photos.note}`; input.onStep?.({ tool: "photos", detail: `${photos.images.length} sheet(s) of attached photos` }); }
	}
	let invalid = 0;
	let totalPromptTokens = 0;
	let freshTokens = 0;
	let rounds = 0;
	let lastPrompt = 0;
	const gate = new VerificationGate();
	const evaluator = new DeliverableEvaluator();
	let steerSeen = 0, browserRevision = input.taskId ? browserControlState(input.taskId).revision : 0;
	const imageCalls = { value: 0 };
	const maxSteps = input.maxSteps ?? MAX_STEPS;
	const guard = new StallGuard();
	const replay = new ActionReplayGuard();
	const turnContext = new RuntimeTurnContext(input.userPrompt ?? input.query);
	let wrapReason: string | null = null, wrapLeft = 1;
	for (let step = 1; step <= Math.min(MAX_STEPS + 30, maxSteps + (input.depth ? 0 : guard.additionalSteps(step))); step += 1) {
		if (input.signal?.aborted) throw new Error("Task stopped"); const handback = await resumedBrowserContext(input, browserRevision, step); browserRevision = handback.revision; if (handback.preface) query = handback.preface + query;
		if (Date.now() - started > DEADLINE_MS) throw new Error("The agent ran out of time before finishing");
		const stall = guard.check({ step, elapsedMs: Date.now() - started, waitedMs: (input.budget?.waited?.seconds ?? 0) * 1000, tokens: freshTokens, resentTokens: totalPromptTokens });
		if (wrapReason !== null) { if (wrapLeft-- <= 0) throw new Error(`The agent was stopped because ${wrapReason}`); }
		else if (stall.stop) { wrapReason = stall.stop; query = wrapUpQuery(stall.stop); input.onStep?.({ tool: "stall_stop", detail: stall.stop }); }
		else if (stall.nudge) { query = `${stall.nudge}\n\n${query}`; input.onStep?.({ tool: "stall_nudge", detail: stall.nudge.slice(0, 140) }); }
		if (conversationId && lastPrompt > COMPACT_AT_PROMPT_TOKENS) {
			metrics.compactions += 1;
			input.onStep?.({ tool: "compact_context", detail: `${Math.round(lastPrompt / 1000)}k tokens` });
			query = await compactConversation({ firstQuery: input.query, user: input.user, conversationId, signal: input.signal, modelSelector: input.modelSelector, chatId: input.chatId, projectId: input.projectId, taskId: input.taskId }).catch(async (cause) => {
				if (input.signal?.aborted || !isConversationLostError(cause)) throw cause;
				return restartAfterLoss(input, query);
			});
			conversationId = undefined;
			images = [];
			lastPrompt = 0;
		}
		if (input.taskId && !input.depth && step > 1) {
			const steer = await takeSteerNotes(input.taskId, steerSeen);
			if (steer.block) { query = `${steer.block}${query}`; steerSeen = steer.seen; input.onStep?.({ tool: "user_note", detail: "The user added a message" }); }
		}
		const modelStarted = Date.now();
		let reply: RuntimeModelReply;
		try { reply = await callRuntimeModel({ query: turnContext.query(query), user: input.user, conversationId, images, signal: input.signal, modelSelector: input.modelSelector }); } catch (cause) {
			if (!conversationId || input.signal?.aborted || !isConversationLostError(cause)) throw cause;
			query = await restartAfterLoss(input, query);
			conversationId = undefined;
			reply = await callRuntimeModel({ query: turnContext.query(query), user: input.user, images, signal: input.signal, modelSelector: input.modelSelector });
			if (reply.conversationId) input.onConversation?.(reply.conversationId);
		}
		metrics.modelMs += Date.now() - modelStarted;
		input.trace!.push({ agent: input.depth ? "sub" : "lead", kind: "model", name: input.modelSelector || "default", ms: Date.now() - modelStarted, ok: true, step, tokens: reply.promptTokens });
		metrics.rounds += 1;
		metrics.promptTokens += reply.promptTokens ?? 0; metrics.stepTokens.push(reply.promptTokens ?? 0); metrics.stepOut.push(reply.completionTokens ?? 0);
		conversationId = reply.conversationId ?? conversationId;
		totalPromptTokens += reply.promptTokens ?? 0;
		freshTokens += Math.max(0, (reply.promptTokens ?? 0) - lastPrompt) + (reply.completionTokens ?? 0);
		lastPrompt = reply.promptTokens ?? 0;
		rounds += 1;
		images = [];
		let actions = parseRuntimeActions(reply.answer);
		const plain = "error" in actions && !input.depth ? plainAnswerAsFinal(reply.answer) : null;
		if (plain) actions = [plain];
		if ("error" in actions) {
			metrics.invalid += 1;
			input.onStep?.({ tool: "invalid_reply", detail: `${actions.error}: ${reply.answer.slice(0, 160).replace(/\s+/g, " ")}` });
			if (++invalid > MAX_INVALID_REPLIES) throw new Error(`The model kept replying without a valid action (${actions.error})`);
			query = `Your reply was not a valid action (${actions.error}). Reply with ONLY JSON, no <think> text and no prose, for example {"action":"shell","command":"ls /work/inputs"} (other actions: xerj_search {query}, xerj_read {index,id}, calculate {expression}, write_file {path,content}, render {path}, reference {query} or {id,find}, web_fetch {url}, web_search {query}, browser {op,url,ref,text,value,...}, workspace_commands {categories}, workspace_view {}, workspace_apply {actions}, workspace_read {}, plan {items}, generate_image {prompt,...}, final {answer,files}). If your last reply was cut off for being too long, split big scripts into write_file parts of under 150 lines.`;
			continue;
		}
		invalid = 0;
		if (wrapReason !== null) {
			const finals = actions.filter((candidate) => candidate.action === "final");
			if (!finals.length) { query = wrapUpQuery(wrapReason); continue; }
			actions = finals;
		}
		const results: string[] = [];
		let skipUntil = 0;
		for (const [index, action] of actions.entries()) {
			if (index < skipUntil) continue; if (await browserPlanOutdated(input, browserRevision)) { results.push("Human changed the browser during this model turn. Discard stale actions and inspect the updated page on the next turn."); break; }
			if (action.action === "delegate" && actions[index + 1]?.action === "delegate") {
				const group = actions.slice(index).filter((candidate, offset, all) => all.slice(0, offset + 1).every((item) => item.action === "delegate")) as Array<Extract<RuntimeAction, { action: "delegate" }>>;
				skipUntil = index + group.length;
				metrics.actions.set("delegate", (metrics.actions.get("delegate") ?? 0) + group.length);
				const started = Date.now();
				const budget = input.budget ?? (input.budget = { delegates: 0 });
				const unique = uniqueParallelJobs(group); const outcomes = await Promise.all(unique.map(({ job }) => delegateToSubAgent(runRuntimeAgent, input, job, budget, MAX_DELEGATES, SUB_AGENT_STEPS)));
				metrics.actionMs += Date.now() - started;
				const prepared = await Promise.all(outcomes.map((outcome) => externalizeActionOutput(input, "delegate", outcome)));
				for (const [offset, outcome] of prepared.entries()) { turnContext.record(unique[offset].job, outcome); results.push(`[${index + unique[offset].index + 1}/${actions.length}] ${outcome.text}`); }
				continue;
			}
			if (action.action === "final" && index > 0) { results.push(`[${index + 1}/${actions.length}] final was not used: it came in the same reply as other actions whose results you had not seen. Check the results above, then send final on its own.`); break; }
			if (action.action === "final") {
				const files: DifyAgentMessage["inlineFiles"] = [];
				const large: Array<{ name: string; absolute: string }> = [];
				const missing: string[] = [];
				const listed = action.files?.length || input.depth ? action.files ?? [] : await newOutputFiles(input.chatId, started);
				if (!input.depth) await storeWorkbookValues(input.chatId, listed);
				for (const file of listed) {
					try {
						const absolute = resolveWorkspacePath(input.chatId, file);
						if (!input.depth && input.ownerEmail && await isLargePdfOutput(absolute)) { large.push({ name: path.basename(file), absolute }); continue; }
						const bytes = await fs.readFile(absolute);
						if (bytes.byteLength > 0 && bytes.byteLength <= MAX_FILE_BYTES) files.push({ name: path.basename(file), bytes });
						else missing.push(file);
					} catch { missing.push(file); }
				}
				const nudge = missing.length || wrapReason !== null ? null : gate.check(listed);
        const finalAudit = !nudge && !input.depth ? auditFinalAnswer({
          answer: action.answer, trace: input.trace!, attempts: invalid,
        }) : null;
        if (finalAudit) { invalid++; results.push(finalAudit); break; }
				if (nudge) { results.push(nudge); break; }
				const verdict = missing.length || wrapReason !== null ? null : await evaluator.check(runRuntimeAgent, input, action.answer, listed);
				if (verdict) { results.push(verdict); break; }
				if (missing.length && ++invalid <= MAX_INVALID_REPLIES) { results.push(`These files listed in final do not exist or are empty: ${missing.join(", ")}. Create them under /work/outputs and send final again.`); break; }
				if (input.taskId && !input.depth) {
					const late = await takeSteerNotes(input.taskId, steerSeen);
					if (late.block) { steerSeen = late.seen; results.push(`${late.block}Update your answer to cover it and send final again.`); break; }
				}
				for (const item of large) {
					const stored = await storeLargePdfOutput({ chatId: input.chatId, ownerEmail: input.ownerEmail!, projectId: input.projectId, boardId: input.boardId }, item.absolute, item.name);
					files.push({ name: item.name, bytes: new Uint8Array(0), resource: stored });
				}
				const g1Receipt = await checkG1SyntheticGoal(input); if (g1Receipt) input.onG1Receipt?.(g1Receipt); if (input.projectId) await saveScriptsOut(input.projectId, input.chatId).catch(() => 0);
				return { answer: g1Receipt ? action.answer + "\n\n" + formatG1Receipt(g1Receipt) : action.answer, conversationId, inlineFiles: files, promptTokens: totalPromptTokens ? estimateContextTokens(totalPromptTokens, rounds) : undefined, iterations: rounds, sources: input.sources };
			}
			const replayKey = spanKey(action.action, JSON.stringify({ ...action, note: undefined }));
			const effectful = mayHaveExternalEffects(action), blocked = replay.before(action.action, replayKey, effectful);
			if (blocked) { input.onStep?.({ tool: "loop_blocked", detail: blocked });
				results.push(blocked + " Change approach or return a partial final answer.");
				guard.noteAction(replayKey, true);
				if (replay.noteBlocked(replayKey) >= 2) { wrapReason = blocked; query = wrapUpQuery(blocked); }
				break; }
			await assertActiveTaskLease();
			replay.markAttempt(replayKey, effectful);
			metrics.actions.set(action.action, (metrics.actions.get(action.action) ?? 0) + 1);
			const actionStarted = Date.now();
			const raw = await withPolicy(input, action, () => runAction(input, action, step, imageCalls, input.budget ?? (input.budget = { delegates: 0 }))) as Awaited<ReturnType<typeof runAction>>;
			const outcome = action.action === "search_output" || action.action === "read_output" ? raw : await externalizeActionOutput(input, action.action, raw);
			if (!input.depth && input.taskId) await recordContextCheckpoint(input, { taskId: input.taskId, step, action: action.action, failed: Boolean(outcome.failed), observation: outcome.text }).catch(() => {});
			turnContext.record(action, outcome);
			replay.record(action.action, replayKey, outcome.text, effectful);
			metrics.actionMs += Date.now() - actionStarted;
			if (action.action !== "wait" && action.action !== "plan") guard.noteAction(replayKey, Boolean(outcome.failed), outcome.text);
			else guard.noteAction(`${action.action}:${step}`, Boolean(outcome.failed), outcome.text);
			if (hasVerifiedMilestone(action, outcome)) guard.noteMilestone(step, replayKey);
			input.trace!.push({ agent: input.depth ? "sub" : "lead", kind: "action", name: action.action, ms: Date.now() - actionStarted, ok: !outcome.failed, step, key: spanKey(action.action, JSON.stringify(action)) });
			if (outcome.failed) { metrics.failed += 1; input.onStep?.({ tool: "tool_failed", detail: `${action.action}: ${outcome.text.replace(/\s+/g, " ").slice(0, 150)}` }); }
			if (outcome.sources?.length) recordSources(input.sources!, outcome.sources);
			if (action.action === "render" && !outcome.failed) gate.noteRender(action.path);
			else if (action.action === "shell" || action.action === "write_file") gate.noteMutation();
			results.push(actions.length > 1 ? `[${index + 1}/${actions.length}] ${outcome.text}` : outcome.text);
			if (outcome.image) images = [outcome.image];
			if (outcome.images?.length) images = outcome.images;
			if (outcome.failed && index < actions.length - 1) { results.push(`Skipped the remaining ${actions.length - index - 1} action(s) because this one failed.`); break; }
		}
		query = results.join("\n\n");
	}
	throw new Error(`The agent used all ${maxSteps} steps without finishing`);
}