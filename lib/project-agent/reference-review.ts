import * as projectCap from "@/lib/capabilities/project";
import { uploadProjectAgentReviewFile, type DifyChatFile } from "./dify-input-files";
import { readProjectAgentFile } from "./task-store";
import { renderProjectAgentFile } from "./visual-review";
import type { ProjectAgentTask } from "./types";

const REFERENCE_EXTENSIONS = new Set(["docx", "pptx", "xlsx", "pdf"]);
const extensionOf = (name: string) => name.split(".").at(-1)?.toLowerCase() ?? "";
const stem = (name: string) => name.replace(/\.[^.]+$/, "").toLowerCase();

/** A project source of the same kind as the deliverable whose name the user mentioned: the template to match. */
export function findReferenceSource<T extends { id: string; name: string }>(prompt: string, sources: T[], outputName: string): T | undefined {
	const extension = extensionOf(outputName);
	if (!REFERENCE_EXTENSIONS.has(extension)) return undefined;
	const text = prompt.toLowerCase();
	return sources.find((source) => extensionOf(source.name) === extension && stem(source.name).length > 2 && text.includes(stem(source.name)));
}

/**
 * Renders the template and the saved deliverable as page-sample contact sheets so the agent can compare them
 * by sight, which the sandbox cannot do. Returns null when the request names no template of the same kind.
 */
export async function buildReferenceReview(
	task: ProjectAgentTask, output: NonNullable<ProjectAgentTask["files"]>[number], user: string, endpoint: string, apiKey: string,
): Promise<{ files: DifyChatFile[]; query: string } | null> {
	const project = await projectCap.getProject(task.projectId, task.projectOwnerEmail ?? task.ownerEmail);
	const source = project.ok && project.data ? findReferenceSource(task.userPrompt ?? task.prompt, project.data.knowledgeFiles, output.name) : undefined;
	if (!source) return null;
	const stored = await projectCap.readKnowledgeOriginal(source.id);
	if (!stored) return null;
	const [reference, produced] = await Promise.all([
		renderProjectAgentFile(source, stored.buffer),
		renderProjectAgentFile(output, await readProjectAgentFile(task.id, output.id)),
	]);
	const files = await Promise.all([
		uploadProjectAgentReviewFile({ name: "template-pages.png", mimeType: "image/png" }, reference.bytes, user, endpoint, apiKey, true),
		uploadProjectAgentReviewFile({ name: "your-output-pages.png", mimeType: "image/png" }, produced.bytes, user, endpoint, apiKey, true),
	]);
	const query = [
		`Visual comparison against the template. The app rendered ${source.name} (first attached image: ${reference.label}) and your saved ${output.name} (second attached image: ${produced.label}). Both show sampled pages in order, so compare like with like.`,
		`Original request:\n${(task.userPrompt ?? task.prompt).slice(0, 3_000)}`,
		"Look at both images and list the visible layout differences from the template: cover and title area, headings (size, colour, spacing), callout and note boxes (fill, border), tables (header style, borders), lists, figure and caption style, headers and footers, margins, page density. If there are differences worth fixing, fix them in the file, return the replacement file link and start exactly VISUAL_QA_REVISED. If the output already matches the template closely, start exactly VISUAL_QA_PASS and name what you compared. Do not change the content text.",
	].join("\n\n");
	return { files, query };
}
