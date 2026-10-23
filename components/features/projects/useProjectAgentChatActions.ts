"use client";

import { useState } from "react";
import type { ProjectAgentConversation } from "@/lib/project-agent/conversations";

export const PROJECT_AGENT_CHATS_CHANGED = "project-agent-chats-changed";

export function notifyProjectAgentChatsChanged(projectId: string): void {
	if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PROJECT_AGENT_CHATS_CHANGED, { detail: { projectId } }));
}

function keyOf(conversation: ProjectAgentConversation): Record<string, string> {
	return conversation.conversationId ? { conversationId: conversation.conversationId } : { taskId: conversation.tasks[0].id };
}

export function useProjectAgentChatActions(projectId: string, onDeleted?: (conversation: ProjectAgentConversation) => void) {
	const [error, setError] = useState("");
	const base = `/api/projects/${encodeURIComponent(projectId)}/agent/chats`;
	async function patch(conversation: ProjectAgentConversation, body: { title?: string; pinned?: boolean; moveToProjectId?: string }) {
		setError("");
		try {
			const response = await fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...keyOf(conversation), ...body }) });
			const payload = await response.json().catch(() => ({})) as { error?: string };
			if (!response.ok) throw new Error(payload.error || "Could not update this chat");
			notifyProjectAgentChatsChanged(projectId);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not update this chat");
		}
	}
	async function remove(conversation: ProjectAgentConversation) {
		setError("");
		try {
			const query = new URLSearchParams(keyOf(conversation));
			const response = await fetch(`${base}?${query}`, { method: "DELETE" });
			const payload = await response.json().catch(() => ({})) as { error?: string };
			if (!response.ok) throw new Error(payload.error || "Could not delete this chat");
			onDeleted?.(conversation);
			notifyProjectAgentChatsChanged(projectId);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not delete this chat");
		}
	}
	return { error, rename: (c: ProjectAgentConversation, title: string) => patch(c, { title }), setPinned: (c: ProjectAgentConversation, pinned: boolean) => patch(c, { pinned }), remove, move: (c: ProjectAgentConversation, targetProjectId: string) => patch(c, { moveToProjectId: targetProjectId }) };
}
