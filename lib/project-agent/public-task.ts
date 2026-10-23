import type { ProjectAgentTask, ProjectAgentTaskInputFile } from "./types";
import { inferProjectAgentFileMetadata } from "./files";
import { readProjectAgentFile } from "./task-store";
import { planFromLog, type PlanItem } from "./plan";
import { activityLabel, activityText, projectAgentLanguage, type ActivityLanguage } from "./activity-language";
import { agentStageText, agentToolReturnedText } from "./activity-stage";

export type PublicProjectAgentTask = Omit<ProjectAgentTask, "ownerEmail" | "projectOwnerEmail" | "difyConversationId" | "bootId" | "log" | "inputFiles"> & { attachments?: ProjectAgentTaskInputFile[]; progress?: string; steps?: string[]; activity?: ProjectAgentActivityStep[]; activityLanguage?: ActivityLanguage; plan?: PlanItem[]; canContinue: boolean };

export interface ProjectAgentActivityStep { label: string; kind: "search" | "read" | "other" | "update"; count: number; details: string[]; images?: string[]; returnedCount?: number }

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

function taskProgress(task: ProjectAgentTask, language: ActivityLanguage): string {
	const t = activityText(language);
	if (task.status === "queued") return t.working;
	if (task.status === "done") return t.completed;
	if (task.status === "failed") return t.failed;
	const latest = task.log.slice(-35).map((line) => line.replace(/^\S+\s+/, "")).reverse()
		.find((line) => /^(?:progress_message ::|app_stage ::|using tool |tool returned |thinking ::|reviewing saved deliverables|starting saved-file read-back|checking saved files)/i.test(line))
		?? task.log.at(-1)?.replace(/^\S+\s+/, "") ?? "";
	if (latest.includes("auto-compacting conversation")) return t.working;
	const stage = latest.match(/^app_stage :: ([a-z_]+)$/);
	if (stage) return agentStageText(stage[1], language) ?? t.working;
	if (/^tool returned \S+ #/.test(latest)) return agentToolReturnedText(language);
	const narrated = latest.match(/^progress_message :: (.{1,240})$/);
	if (narrated) return narrated[1];
	const reviewPass = latest.match(/reviewing saved deliverables \(pass (\d+\/\d+)\)/i);
	if (reviewPass) return language === "en" ? `Reviewing saved files (pass ${reviewPass[1]})` : `${t.review} (${reviewPass[1]})`;
	if (latest.includes("saved-file read-back and visual review")) return t.review;
	const thinking = latest.match(/^thinking :: step (\d+)/i)?.[1];
	if (thinking) return language === "en" ? `Thinking about the next step (step ${thinking})` : `${t.thinking} (${thinking})`;
	const used = latest.match(/^using tool (\S+)(?: #\S+)?(?: :: (.*))?$/i);
	if (used) {
		const label = language === "en" ? TOOL_LABELS[used[1].toLowerCase()] ?? t.tool : activityLabel(used[1], language);
		const detail = used[1].startsWith("sandbox_") || used[1] === "render_pages" || used[1] === "web_fetch" || used[1] === "web_search" || used[1] === "workspace" || used[1] === "delegate" || used[1] === "generate_image" || used[1] === "calculate" ? used[2]?.replace(/\s+/g, " ").trim().slice(0, 90) : "";
		return detail && !/(shell|code|write|workspace_apply|sandbox|execute)/i.test(used[1]) && !/[{}\n;]/.test(detail) ? `${label}: ${detail}` : label;
	}
	return t.working;
}

/** The agent's recent tool steps as readable labels ("Searching the web ×2"), oldest first, for the live status line. */
export function taskSteps(log: string[], language: ActivityLanguage = "en"): string[] {
	return taskActivity(log, language).slice(-8).map((step) => step.count > 1 ? `${step.label} ×${step.count}` : step.label);
}

const SEARCH_TOOLS = /search|arxiv|pubmed|wikipedia|yahoo/i;
const READ_TOOLS = /scraper|fetch|markitdown|read_file|reader/i;

/** Tool steps grouped by label with their queries/pages, deduplicated by the Dify thought id so repeated stream events count once. */
export function taskActivity(log: string[], language: ActivityLanguage = "en"): ProjectAgentActivityStep[] {
	const byId = new Map<string, { tool: string; detail: string; returned?: boolean }>();
	const order: string[] = [];
	log.forEach((line, index) => {
		const entry = line.replace(/^\S+\s+/, "");
		const stage = entry.match(/^app_stage :: ([a-z_]+)$/);
		if (stage) { const id = `stage-${index}`; order.push(id); byId.set(id, { tool: "app_stage", detail: stage[1] }); return; }
		const returned = entry.match(/^tool returned (\S+) #(\S+)$/);
		if (returned) { const id = returned[2]; const earlier = byId.get(id); if (!earlier) order.push(id); byId.set(id, { tool: earlier?.tool ?? returned[1], detail: earlier?.detail ?? "", returned: true }); return; }
		const narration = entry.match(/^progress_message :: (.{1,240})$/);
		if (narration) { const id = `comment-${index}`; order.push(id); byId.set(id, { tool: "progress_message", detail: narration[1] }); return; }
		const match = entry.match(/^using tool (\S+)(?: #(\S+))?(?: :: (.*))?$/i);
		if (!match) return;
		const id = match[2] ?? `line-${index}`;
		if (!byId.has(id)) order.push(id);
		byId.set(id, { tool: match[1], detail: match[3]?.trim() || byId.get(id)?.detail || "", returned: byId.get(id)?.returned });
	});
	const steps: ProjectAgentActivityStep[] = [];
	for (const id of order) {
		const { tool, detail, returned } = byId.get(id)!;
		const label = tool === "app_stage" ? agentStageText(detail, language) ?? activityText(language).working : tool === "progress_message" ? detail : language === "en" ? TOOL_LABELS[tool.toLowerCase()] ?? activityText(language).tool : activityLabel(tool, language);
		const kind = tool === "progress_message" || tool === "app_stage" ? "update" : SEARCH_TOOLS.test(tool) ? "search" : READ_TOOLS.test(tool) ? "read" : "other";
		const image = id.startsWith("render-") ? id : undefined;
		const last = steps.at(-1);
		if (last && last.label === label && kind !== "update") { last.count += 1; if (returned) last.returnedCount = (last.returnedCount ?? 0) + 1; if (detail) last.details.push(detail); if (image) (last.images ??= []).push(image); }
		else steps.push({ label, kind, count: 1, details: kind === "update" ? [] : detail ? [detail] : [], ...(returned ? { returnedCount: 1 } : {}), ...(image ? { images: [image] } : {}) });
	}
	return steps.slice(-20);
}

export function toPublicProjectAgentTask(task: ProjectAgentTask, viewerEmail = task.ownerEmail): PublicProjectAgentTask {
	const { ownerEmail: _ownerEmail, projectOwnerEmail: _projectOwnerEmail, difyConversationId: _difyConversationId,
		bootId: _bootId, log: _log, inputFiles: _inputFiles, ...publicTask } = task;
	const filesAvailable = !task.filesExpireAt || Date.parse(task.filesExpireAt) > Date.now();
	const activityLanguage = projectAgentLanguage(task.userPrompt ?? task.prompt);
	const canContinue = task.ownerEmail.trim().toLowerCase() === viewerEmail.trim().toLowerCase();
	return {
		...publicTask,
		canContinue,
		attachments: task.inputFiles?.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size })),
		conversationId: canContinue ? task.conversationId : undefined,
		progress: taskProgress(task, activityLanguage),
		steps: taskSteps(task.log, activityLanguage),
		activity: taskActivity(task.log, activityLanguage),
		activityLanguage,
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
