const STORAGE_PREFIX = "project-agent-conversation:";
const CHANGE_EVENT = "project-agent-conversation-change";

function notifyChanged(projectId: string): void {
	if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
		window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { projectId } }));
	}
}

function storageKey(projectId: string): string {
	return `${STORAGE_PREFIX}${encodeURIComponent(projectId)}`;
}

export function getProjectAgentConversationId(projectId: string): string | null {
	if (!projectId || typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(storageKey(projectId));
	} catch {
		return null;
	}
}

export function setProjectAgentConversationId(projectId: string, conversationId: string): void {
	if (!projectId || !conversationId || typeof window === "undefined") return;
	try {
		window.localStorage.setItem(storageKey(projectId), conversationId);
		notifyChanged(projectId);
	} catch {
		// The persisted Project Agent task history remains available if storage is disabled.
	}
}

export function clearProjectAgentConversationId(projectId: string): void {
	if (!projectId || typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(storageKey(projectId));
		notifyChanged(projectId);
	} catch {
		// Starting a new Project chat still works when storage is disabled.
	}
}

export function subscribeToProjectAgentConversationChanges(
	projectId: string,
	listener: () => void,
): () => void {
	if (!projectId || typeof window === "undefined") return () => {};
	const handleChange = (event: Event) => {
		if ((event as CustomEvent<{ projectId?: string }>).detail?.projectId === projectId) listener();
	};
	window.addEventListener(CHANGE_EVENT, handleChange);
	return () => window.removeEventListener(CHANGE_EVENT, handleChange);
}
