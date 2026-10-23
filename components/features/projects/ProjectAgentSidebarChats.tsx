"use client";

import { useCallback, useEffect, useState } from "react";
import { Pin } from "lucide-react";
import { groupProjectAgentTasks } from "@/lib/project-agent/conversations";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";
import { clearProjectAgentView, getProjectAgentViewId, selectProjectAgentView, subscribeToProjectAgentView } from "@/lib/project-agent/view-session";
import { setProjectAgentConversationId } from "@/lib/project-agent/conversation-session";
import { ProjectChatMenu } from "./ProjectChatMenu";
import { PROJECT_AGENT_CHATS_CHANGED, useProjectAgentChatActions } from "./useProjectAgentChatActions";
import { useMessageStore } from "@/stores/useMessageStore";
import { useProjectStore } from "@/stores/useProjectStore";

export function ProjectAgentSidebarChats({ projectId }: { projectId: string }) {
	const activeProjectId = useProjectStore((state) => state.activeProjectId);
	const [tasks, setTasks] = useState<PublicProjectAgentTask[]>([]);
	const [viewId, setViewId] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const groups = groupProjectAgentTasks(tasks).slice(0, 8);
	const [reloadKey, setReloadKey] = useState(0);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const allProjects = useProjectStore((state) => state.projects);
	const moveTargets = allProjects.filter((item) => item.id !== projectId && item.sharedRole !== "CHAT").map((item) => ({ id: item.id, name: item.name }));
	const chatActions = useProjectAgentChatActions(projectId, (conversation) => {
		if (getProjectAgentViewId(projectId) === (conversation.conversationId ?? conversation.tasks[0].id)) clearProjectAgentView(projectId);
	});
	useEffect(() => {
		const onChanged = (event: Event) => {
			if ((event as CustomEvent<{ projectId: string }>).detail?.projectId === projectId) setReloadKey((value) => value + 1);
		};
		window.addEventListener(PROJECT_AGENT_CHATS_CHANGED, onChanged);
		return () => window.removeEventListener(PROJECT_AGENT_CHATS_CHANGED, onChanged);
	}, [projectId]);

	const load = useCallback(async (signal: AbortSignal) => {
		setLoading(true);
		try {
			const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks?limit=20`, { signal });
			if (!response.ok) return;
			const payload = await response.json() as { tasks?: PublicProjectAgentTask[] };
			setTasks(Array.isArray(payload.tasks) ? payload.tasks : []);
		} catch { /* Keep the last available conversation list during temporary network errors. */ }
		finally { if (!signal.aborted) setLoading(false); }
	}, [projectId]);

	useEffect(() => {
		if (activeProjectId !== projectId) return;
		const controller = new AbortController();
		const syncView = () => setViewId(getProjectAgentViewId(projectId));
		syncView();
		void load(controller.signal);
		const unsubscribe = subscribeToProjectAgentView(projectId, syncView);
		return () => { controller.abort(); unsubscribe(); };
	}, [activeProjectId, load, projectId, reloadKey]);

	if (activeProjectId !== projectId || (groups.length === 0 && !loading)) return null;
	const openChat = (conversationId: string | undefined, taskId: string) => {
		const id = conversationId ?? taskId;
		if (conversationId) setProjectAgentConversationId(projectId, conversationId);
		useMessageStore.getState().clearMessages();
		sessionStorage.removeItem("conversation_id");
		sessionStorage.removeItem("conversation_category");
		sessionStorage.removeItem("conversation_user");
		selectProjectAgentView(projectId, id);
	};

	return <div className="mt-0.5 pl-4">
		<div className="space-y-0.5">{groups.map((group) => {
			const first = group.tasks[0];
			const id = group.conversationId ?? first.id;
			if (renamingId === group.id) return <input key={group.id} autoFocus aria-label="Chat title" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onBlur={() => { const title = renameValue.trim(); setRenamingId(null); if (title && title !== group.title) void chatActions.rename(group, title); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setRenameValue(group.title); setRenamingId(null); } }} className="w-full rounded-md border border-orange-300 bg-transparent px-2 py-1 text-[13px] outline-none" />;
			if (confirmDeleteId === group.id) return <div key={group.id} className="flex items-center gap-1 px-2 py-1 text-[13px]"><span className="min-w-0 flex-1 truncate text-red-600">Delete chat?</span><button type="button" onClick={() => { setConfirmDeleteId(null); void chatActions.remove(group); }} className="rounded bg-red-600 px-2 py-0.5 text-[10px] text-white">Delete</button><button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded px-2 py-0.5 text-[10px] text-slate-500">Cancel</button></div>;
			return <div key={group.id} className={`group flex items-center rounded-md transition-colors ${viewId === id ? "bg-slate-200/60 text-slate-900 dark:bg-slate-800 dark:text-slate-100" : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60"}`}><button type="button" onClick={() => openChat(group.conversationId, first.id)} title={group.title} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[13px]">{group.pinned ? <Pin className="h-3 w-3 shrink-0 fill-current text-orange-600" aria-label="Pinned" /> : null}<span className="min-w-0 flex-1 truncate">{group.title}</span></button>{first.canContinue && <ProjectChatMenu align="left" title={group.title} pinned={group.pinned} canEdit onRename={() => { setRenameValue(group.title); setRenamingId(group.id); }} onTogglePin={() => void chatActions.setPinned(group, !group.pinned)} onDelete={() => setConfirmDeleteId(group.id)} moveTargets={moveTargets} onMove={(target) => void chatActions.move(group, target)} />}</div>;
		})}</div>
		{groups.length > 0 && <button type="button" onClick={() => { clearProjectAgentView(projectId); useMessageStore.getState().clearMessages(); }} className="mt-1 w-full rounded-md px-2 py-1 text-left text-[13px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">Show more</button>}
	</div>;
}
