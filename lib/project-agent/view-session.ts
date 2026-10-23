const KEY_PREFIX = "project-agent-view:";
const CHANGE_EVENT = "project-agent-view-change";
const REQUEST_EDIT_EVENT = "project-agent-request-edit";
const FILE_PREFIX = "project-agent-file-context:";
const INITIAL_PROMPT_PREFIX = "project-agent-initial-prompt:";
const CANVAS_PREFIX = "project-agent-canvas:";
export const NEW_PROJECT_AGENT_VIEW_ID = "new-project-agent-chat";
const initialFiles = new Map<string, File[]>();

export interface ProjectAgentFileContext {
	taskId: string;
	fileId: string;
	fileName: string;
	mimeType: string;
	conversationId?: string;
	savedToProjectFileId?: string;
	pageNumber?: number;
	/** Area the user marked on that page in the viewer, in percent of the page (Request edits). */
	region?: { x: number; y: number; width: number; height: number };
	/** The change the user typed for that area; used as the request when the chat box is left empty. */
	note?: string;
}

export interface ProjectAgentCanvasSelection {
	conversationId: string;
	taskId: string;
	fileId: string;
}

function key(projectId: string) {
	return `${KEY_PREFIX}${encodeURIComponent(projectId)}`;
}

function fileKey(projectId: string) {
	return `${FILE_PREFIX}${encodeURIComponent(projectId)}`;
}

function initialPromptKey(projectId: string) {
	return `${INITIAL_PROMPT_PREFIX}${encodeURIComponent(projectId)}`;
}

function canvasKey(projectId: string, conversationId: string) {
	return `${CANVAS_PREFIX}${encodeURIComponent(projectId)}:${encodeURIComponent(conversationId)}`;
}

function notify(projectId: string) {
	window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { projectId } }));
}

export function getProjectAgentViewId(projectId: string): string | null {
	if (!projectId || typeof window === "undefined") return null;
	try { return window.localStorage.getItem(key(projectId)); } catch { return null; }
}

export function selectProjectAgentView(projectId: string, viewId: string): void {
	if (!projectId || !viewId || typeof window === "undefined") return;
	try {
		window.localStorage.setItem(key(projectId), viewId);
		notify(projectId);
	} catch { /* The sidebar history still works if local storage is disabled. */ }
}

export function clearProjectAgentView(projectId: string): void {
	if (!projectId || typeof window === "undefined") return;
	initialFiles.delete(projectId);
	try { window.localStorage.removeItem(key(projectId)); window.sessionStorage.removeItem(initialPromptKey(projectId)); notify(projectId); } catch { /* Chat remains usable without stored view state. */ }
}

export function setProjectAgentInitialPrompt(projectId: string, prompt: string, files: File[] = []): void {
	if (!projectId || typeof window === "undefined") return;
	if (files.length) initialFiles.set(projectId, files);
	else initialFiles.delete(projectId);
	try { window.sessionStorage.setItem(initialPromptKey(projectId), prompt); } catch { /* The user can still enter the prompt in the new chat. */ }
}

export function consumeProjectAgentInitialPrompt(projectId: string): string | null {
	if (!projectId || typeof window === "undefined") return null;
	try {
		const prompt = window.sessionStorage.getItem(initialPromptKey(projectId));
		window.sessionStorage.removeItem(initialPromptKey(projectId));
		return prompt;
	} catch { return null; }
}

export function consumeProjectAgentInitialFiles(projectId: string): File[] {
	if (!projectId || typeof window === "undefined") return [];
	const files = initialFiles.get(projectId) ?? [];
	initialFiles.delete(projectId);
	return files;
}

export function getProjectAgentFileContext(projectId: string): ProjectAgentFileContext | null {
	if (!projectId || typeof window === "undefined") return null;
	try {
		const value = window.localStorage.getItem(fileKey(projectId));
		return value ? JSON.parse(value) as ProjectAgentFileContext : null;
	} catch { return null; }
}

export function setProjectAgentFileContext(projectId: string, context: ProjectAgentFileContext): boolean {
	if (!projectId || typeof window === "undefined") return false;
	try { window.localStorage.setItem(fileKey(projectId), JSON.stringify(context)); notify(projectId); return true; } catch { return false; }
}

/** Saves a viewer edit request and signals the mounted conversation to submit it once. */
export function requestProjectAgentFileEdit(projectId: string, context: ProjectAgentFileContext): void {
	if (!setProjectAgentFileContext(projectId, context)) return;
	window.dispatchEvent(new CustomEvent(REQUEST_EDIT_EVENT, { detail: { projectId } }));
}

export function clearProjectAgentFileContext(projectId: string): void {
	if (!projectId || typeof window === "undefined") return;
	try { window.localStorage.removeItem(fileKey(projectId)); notify(projectId); } catch { /* Ignore disabled local storage. */ }
}

export function getProjectAgentCanvasSelection(projectId: string, conversationId: string): ProjectAgentCanvasSelection | null {
	if (!projectId || !conversationId || typeof window === "undefined") return null;
	try {
		const value = window.localStorage.getItem(canvasKey(projectId, conversationId));
		if (!value) return null;
		const selection = JSON.parse(value) as Partial<ProjectAgentCanvasSelection>;
		if (selection.conversationId !== conversationId || !selection.taskId || !selection.fileId) return null;
		return selection as ProjectAgentCanvasSelection;
	} catch { return null; }
}

export function setProjectAgentCanvasSelection(projectId: string, selection: ProjectAgentCanvasSelection): void {
	if (!projectId || !selection.conversationId || !selection.taskId || !selection.fileId || typeof window === "undefined") return;
	try { window.localStorage.setItem(canvasKey(projectId, selection.conversationId), JSON.stringify(selection)); notify(projectId); } catch { /* File preview remains available for this visit. */ }
}

export function clearProjectAgentCanvasSelection(projectId: string, conversationId: string, taskId?: string, fileId?: string): void {
	if (!projectId || !conversationId || typeof window === "undefined") return;
	try {
		const current = getProjectAgentCanvasSelection(projectId, conversationId);
		if (current && (!taskId || current.taskId === taskId) && (!fileId || current.fileId === fileId)) {
			window.localStorage.removeItem(canvasKey(projectId, conversationId));
			notify(projectId);
		}
	} catch { /* File preview remains available for this visit. */ }
}

export function subscribeToProjectAgentView(projectId: string, listener: () => void): () => void {
	if (!projectId || typeof window === "undefined") return () => {};
	const handleChange = (event: Event) => {
		if ((event as CustomEvent<{ projectId?: string }>).detail?.projectId === projectId) listener();
	};
	window.addEventListener(CHANGE_EVENT, handleChange);
	return () => window.removeEventListener(CHANGE_EVENT, handleChange);
}

export function subscribeToProjectAgentFileEdit(projectId: string, listener: () => void): () => void {
	if (!projectId || typeof window === "undefined") return () => {};
	const handleRequest = (event: Event) => {
		if ((event as CustomEvent<{ projectId?: string }>).detail?.projectId === projectId) listener();
	};
	window.addEventListener(REQUEST_EDIT_EVENT, handleRequest);
	return () => window.removeEventListener(REQUEST_EDIT_EVENT, handleRequest);
}
