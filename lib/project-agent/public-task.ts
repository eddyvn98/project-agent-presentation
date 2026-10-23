import type { ProjectAgentTask, ProjectAgentTaskInputFile } from "./types";
import { inferProjectAgentFileMetadata } from "./files";
import { readProjectAgentFile } from "./task-store";
import { planFromLog, type PlanItem } from "./plan";

export type PublicProjectAgentTask = Omit<ProjectAgentTask, "ownerEmail" | "projectOwnerEmail" | "difyConversationId" | "bootId" | "log" | "inputFiles"> & { attachments?: ProjectAgentTaskInputFile[]; progress?: string; steps?: string[]; activity?: ProjectAgentActivityStep[]; plan?: PlanItem[]; canContinue: boolean };

export interface ProjectAgentActivityStep { label: string; kind: "search" | "read" | "other"; count: number; details: string[]; images?: string[] }

const TOOL_LABELS: Record<string, string> = {
	calculate: "Calculated an expression",
	shell_run: "Running commands in the sandbox",
	sandbox_shell: "Running a command in the sandbox",
	sandbox_write: "Writing a file in the sandbox",
	invalid_reply: "Asking the model to retry",
	render_pages: "Looking at the rendered pages",
	delegate: "Working with a sub-agent",
	wait: "Waiting for a process to finish",
	web_fetch: "Reading a web page",
	web_search: "Searching the web",
	workspace: "Working in a Workspace board",
	generate_image: "Generating images with the Image Generator",
	compact_context: "Working on your request",
	shell_wait: "Waiting for a command to finish",
	simple_code: "Running code",
	json2excel: "Building the Excel file",
	markitdown: "Reading a file",
	duckduckgo_search: "Searching the web",
	webscraper: "Reading a web page",
	create_xlsx: "Building the Excel file",
	create_docx: "Building the Word document",
	create_pptx: "Building the presentation",
	read_file: "Reading a file",
	ddgo_search: "Searching the web",
	md_to_pptx: "Building the presentation",
	md_to_docx: "Building the Word document",
	markdown_to_docx_converter: "Building the Word document",
	markdown_to_pptx_converter: "Building the presentation",
	md_to_xlsx: "Building the Excel file",
	md_to_pdf: "Building the PDF",
	md_to_html: "Building the HTML page",
	echarts_convert: "Drawing a chart",
	arxiv_search: "Searching arXiv",
	pubmed_search: "Searching PubMed",
	wikipedia_search: "Searching Wikipedia",
	browser_open: "Opening a webpage",
	browser_back: "Going back in browser history",
	browser_snapshot: "Reading a page snapshot",
	browser_click: "Clicking a page control",
	browser_type: "Entering text on a page",
	browser_press: "Pressing a key in the browser",
	browser_select: "Selecting a page option",
	browser_scroll: "Scrolling the page",
	browser_screenshot: "Taking a browser screenshot",
	browser_extract: "Reading page content",
	browser_download: "Downloading a file",
	browser_console: "Checking browser console messages",
	browser_network: "Checking browser network requests",
	browser_close: "Closing the browser session",
};

function taskProgress(task: ProjectAgentTask): string {
	if (task.status === "queued") return "Waiting for the Project Agent to start";
	if (task.status === "done") return "Finished reviewing the deliverables";
	if (task.status === "failed") return "The task could not be completed";
	const latest = task.log.at(-1)?.replace(/^\S+\s+/, "") ?? "";
	if (latest.includes("auto-compacting conversation")) return "Working on your request";
	const reviewPass = latest.match(/reviewing saved deliverables \(pass (\d+\/\d+)\)/i);
	if (reviewPass) return `Reviewing saved files (pass ${reviewPass[1]})`;
	if (latest.includes("saved-file read-back and visual review")) return "Inspecting the saved files and previews";
	const thinking = latest.match(/^thinking :: step (\d+)/i)?.[1];
	if (thinking) return `Thinking about the next step (step ${thinking})`;
	const used = latest.match(/^using tool (\S+)(?: #\S+)?(?: :: (.*))?$/i);
	if (used) {
		const label = TOOL_LABELS[used[1].toLowerCase()] ?? `Using tool ${used[1]}`;
		const detail = used[1].startsWith("sandbox_") || used[1] === "render_pages" || used[1] === "web_fetch" || used[1] === "web_search" || used[1] === "workspace" || used[1] === "delegate" || used[1] === "generate_image" || used[1] === "calculate" ? used[2]?.replace(/\s+/g, " ").trim().slice(0, 90) : "";
		return detail ? `${label}: ${detail}` : label;
	}
	return "Working with the Project Agent";
}

/** The agent's recent tool steps as readable labels ("Searching the web ×2"), oldest first, for the live status line. */
export function taskSteps(log: string[]): string[] {
	return taskActivity(log).slice(-8).map((step) => step.count > 1 ? `${step.label} ×${step.count}` : step.label);
}

const SEARCH_TOOLS = /search|arxiv|pubmed|wikipedia|yahoo/i;
const READ_TOOLS = /scraper|fetch|markitdown|read_file|reader/i;

/** Tool steps grouped by label with their queries/pages, deduplicated by the Dify thought id so repeated stream events count once. */
export function taskActivity(log: string[]): ProjectAgentActivityStep[] {
	const byId = new Map<string, { tool: string; detail: string }>();
	const order: string[] = [];
	log.forEach((line, index) => {
		const match = line.replace(/^\S+\s+/, "").match(/^using tool (\S+)(?: #(\S+))?(?: :: (.*))?$/i);
		if (!match) return;
		const id = match[2] ?? `line-${index}`;
		if (!byId.has(id)) order.push(id);
		byId.set(id, { tool: match[1], detail: match[3]?.trim() || byId.get(id)?.detail || "" });
	});
	const steps: ProjectAgentActivityStep[] = [];
	for (const id of order) {
		const { tool, detail } = byId.get(id)!;
		const label = TOOL_LABELS[tool.toLowerCase()] ?? tool;
		const kind = SEARCH_TOOLS.test(tool) ? "search" : READ_TOOLS.test(tool) ? "read" : "other";
		const image = id.startsWith("render-") ? id : undefined;
		const last = steps.at(-1);
		if (last && last.label === label) { last.count += 1; if (detail) last.details.push(detail); if (image) (last.images ??= []).push(image); }
		else steps.push({ label, kind, count: 1, details: detail ? [detail] : [], ...(image ? { images: [image] } : {}) });
	}
	return steps.slice(-20);
}

export function toPublicProjectAgentTask(task: ProjectAgentTask, viewerEmail = task.ownerEmail): PublicProjectAgentTask {
	const { ownerEmail: _ownerEmail, projectOwnerEmail: _projectOwnerEmail, difyConversationId: _difyConversationId,
		bootId: _bootId, log: _log, inputFiles: _inputFiles, ...publicTask } = task;
	const filesAvailable = !task.filesExpireAt || Date.parse(task.filesExpireAt) > Date.now();
	const canContinue = task.ownerEmail.trim().toLowerCase() === viewerEmail.trim().toLowerCase();
	return {
		...publicTask,
		canContinue,
		attachments: task.inputFiles?.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size })),
		conversationId: canContinue ? task.conversationId : undefined,
		progress: taskProgress(task),
		steps: taskSteps(task.log),
		activity: taskActivity(task.log),
		plan: planFromLog(task.log),
		files: task.files?.filter((file) => filesAvailable || Boolean(file.savedToProjectFileId) || Boolean(file.resource)) ?? [],
	};
}

export async function toPublicProjectAgentTaskWithFileMetadata(task: ProjectAgentTask, viewerEmail = task.ownerEmail): Promise<PublicProjectAgentTask> {
	const publicTask = toPublicProjectAgentTask(task, viewerEmail);
	if (!publicTask.files?.length) return publicTask;
	const files = await Promise.all(publicTask.files.map(async (file) => {
		if (file.mimeType !== "application/octet-stream" && /\.[^./]+$/.test(file.name)) return file;
		const bytes = await readProjectAgentFile(task.id, file.id).catch(() => null);
		if (!bytes) return file;
		const metadata = inferProjectAgentFileMetadata(file.name, file.mimeType, bytes);
		return metadata.name === file.name && metadata.mimeType === file.mimeType ? file : { ...file, ...metadata, size: bytes.byteLength };
	}));
	return { ...publicTask, files };
}
