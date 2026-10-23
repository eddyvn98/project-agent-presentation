"use client";

import { useCallback, useEffect, useState } from "react";
import { groupProjectAgentTasks, type ProjectAgentConversation } from "@/lib/project-agent/conversations";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";
import { PROJECT_AGENT_CHATS_CHANGED } from "./useProjectAgentChatActions";

/** Agent chats of a project (server-side search + 20 newest tasks), refreshed when a chat is renamed/moved/deleted. */
export function useProjectAgentConversations(projectId: string | null, query = ""): { conversations: ProjectAgentConversation[]; loading: boolean; error: string; retry: () => void } {
	const [error, setError] = useState("");
	const [scope, setScope] = useState("");
	const retry = useCallback(() => setReload((value) => value + 1), []);
	const [tasks, setTasks] = useState<PublicProjectAgentTask[]>([]);
	const [loading, setLoading] = useState(false);
	const [reload, setReload] = useState(0);
	useEffect(() => {
		if (!projectId) return;
		const onChanged = (event: Event) => {
			if ((event as CustomEvent<{ projectId: string }>).detail?.projectId === projectId) setReload((value) => value + 1);
		};
		window.addEventListener(PROJECT_AGENT_CHATS_CHANGED, onChanged);
		return () => window.removeEventListener(PROJECT_AGENT_CHATS_CHANGED, onChanged);
	}, [projectId]);
	useEffect(() => {
		if (!projectId) { setTasks([]); setLoading(false); setError(""); return; }
		const controller = new AbortController();
		setLoading(true);
		setError("");
		const timer = window.setTimeout(() => {
			setLoading(true);
			const params = new URLSearchParams({ limit: "20", ...(query.trim() ? { q: query.trim() } : {}) });
			fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks?${params}`, { signal: controller.signal })
				.then((response) => { if (!response.ok) throw new Error(`Could not load chats (${response.status})`); return response.json(); })
				.then((data: { tasks?: PublicProjectAgentTask[] }) => {
					if (controller.signal.aborted) return;
					if (!Array.isArray(data?.tasks)) throw new Error("Invalid chat history response");
					setTasks(data.tasks); setScope(`${projectId}:${query.trim()}`);
				})
				.catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load chats"); })
				.finally(() => { if (!controller.signal.aborted) setLoading(false); });
		}, query.trim() ? 300 : 0);
		return () => { window.clearTimeout(timer); controller.abort(); };
	}, [projectId, query, reload]);
	return { conversations: groupProjectAgentTasks(scope === `${projectId}:${query.trim()}` ? tasks : []), loading, error, retry };
}
