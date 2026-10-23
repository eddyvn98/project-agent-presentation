"use client";

import { useEffect, useState } from "react";
import { groupProjectAgentTasks, type ProjectAgentConversation } from "@/lib/project-agent/conversations";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";
import { PROJECT_AGENT_CHATS_CHANGED } from "./useProjectAgentChatActions";

/** Agent chats of a project (server-side search + 20 newest tasks), refreshed when a chat is renamed/moved/deleted. */
export function useProjectAgentConversations(projectId: string | null, query = ""): { conversations: ProjectAgentConversation[]; loading: boolean } {
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
		if (!projectId) { setTasks([]); return; }
		const controller = new AbortController();
		const timer = window.setTimeout(() => {
			setLoading(true);
			const params = new URLSearchParams({ limit: "20", ...(query.trim() ? { q: query.trim() } : {}) });
			fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks?${params}`, { signal: controller.signal })
				.then((response) => response.ok ? response.json() : { tasks: [] })
				.then((data: { tasks?: PublicProjectAgentTask[] }) => setTasks(Array.isArray(data.tasks) ? data.tasks : []))
				.catch(() => {})
				.finally(() => { if (!controller.signal.aborted) setLoading(false); });
		}, query.trim() ? 300 : 0);
		return () => { window.clearTimeout(timer); controller.abort(); };
	}, [projectId, query, reload]);
	return { conversations: groupProjectAgentTasks(tasks), loading };
}
