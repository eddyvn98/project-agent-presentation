"use client";
import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";
import { NEW_PROJECT_AGENT_VIEW_ID, selectProjectAgentView } from "@/lib/project-agent/view-session";

/** A single in-flight refresh per view. Switching scope aborts and ignores old results. */
export function useProjectAgentConversationSync(
  projectId: string | null, viewId: string | null,
  setTasks: Dispatch<SetStateAction<PublicProjectAgentTask[]>>,
  setLoadedViewId: Dispatch<SetStateAction<string | null>>,
  setLoadError: Dispatch<SetStateAction<string>>,
) {
	useEffect(() => {
		if (!projectId || !viewId) { setTasks([]); setLoadError(""); return; }
		let cancelled = false;
		let loading = false;
		const controller = new AbortController();
		setTasks([]);
		setLoadedViewId(null);
		let lastPayload = "";
		setLoadError("");
		const load = async () => {
			if (loading || cancelled) return;
			loading = true;
			try {
				const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks?limit=20`, { signal: controller.signal, cache: "no-store" });
				if (!response.ok) throw new Error("Could not load this Project Agent chat");
				const raw = await response.text();
				const data = JSON.parse(raw) as { tasks?: PublicProjectAgentTask[] };
				if (!Array.isArray(data.tasks)) throw new Error("Invalid chat history response");
				if (!cancelled) setLoadError("");
				if (!cancelled && raw !== lastPayload) {
					lastPayload = raw;
					const all = data.tasks ?? [];
					// A chat opened before its first task got a conversation id is addressed by task id; canonicalize it.
					const byTaskId = all.find((task) => task.id === viewId);
					const key = byTaskId?.conversationId ?? viewId;
					setTasks(viewId === NEW_PROJECT_AGENT_VIEW_ID ? [] : all.filter((task) => (task.conversationId ?? task.id) === key));
					setLoadedViewId(viewId);
					setLoadError("");
					if (byTaskId?.conversationId && byTaskId.conversationId !== viewId) selectProjectAgentView(projectId, byTaskId.conversationId);
				}
			} catch (cause) {
				if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Could not load Project Agent chat");
			} finally { loading = false; }
		};
		void load();
		const timer = window.setInterval(() => void load(), 1500);
		return () => { cancelled = true; controller.abort(); window.clearInterval(timer); };
	}, [projectId, viewId, setTasks, setLoadedViewId, setLoadError]);
}
