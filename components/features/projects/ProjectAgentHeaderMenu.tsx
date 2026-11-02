"use client";
import { FlaskConical, Settings2, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { useProjectStore } from "@/stores/useProjectStore";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { groupProjectAgentTasks } from "@/lib/project-agent/conversations";
import { clearProjectAgentConversationId } from "@/lib/project-agent/conversation-session";
import { clearProjectAgentView } from "@/lib/project-agent/view-session";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";
import { ProjectAgentFilesPanel } from "./ProjectAgentFilesPanel";
import { ProjectChatMenu } from "./ProjectChatMenu";
import { useProjectAgentChatActions } from "./useProjectAgentChatActions";

type TaskFile = NonNullable<PublicProjectAgentTask["files"]>[number];

/** The chat's "..." menu in the header: rename, pin, view files, delete, move (same actions as the sidebar rows). */
export function ProjectAgentHeaderMenu({ projectId, tasks, fileUrl }: { projectId: string; tasks: PublicProjectAgentTask[]; fileUrl: (task: PublicProjectAgentTask, file: TaskFile) => string}) {
	const allProjects = useProjectStore((state) => state.projects);
	const moveTargets = allProjects.filter((item) => item.id !== projectId && item.sharedRole !== "CHAT").map((item) => ({ id: item.id, name: item.name }));
	const [panel, setPanel] = useState(false);
	const [renaming, setRenaming] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [agentMenu, setAgentMenu] = useState(false);
	const agentMenuRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!agentMenu) return;
		const close = (e: MouseEvent | KeyboardEvent) => {
			if (e instanceof KeyboardEvent && e.key === "Escape") setAgentMenu(false);
			else if (e instanceof MouseEvent && !agentMenuRef.current?.contains(e.target as Node)) setAgentMenu(false);
		};
		document.addEventListener("mousedown", close);
		document.addEventListener("keydown", close);
		return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
	}, [agentMenu]);
	const actions = useProjectAgentChatActions(projectId, () => { clearProjectAgentConversationId(projectId); clearProjectAgentView(projectId); });
	const conversation = tasks.length ? groupProjectAgentTasks(tasks).at(-1) : undefined;
	if (!conversation || !tasks[0]?.canContinue) return null;
	const modal = "fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4";
	return <div className="ml-auto flex items-center gap-1">
		<div ref={agentMenuRef} className="relative">
			<button type="button" aria-label="Manage Project Agent" title="Manage Project Agent" onClick={() => setAgentMenu((v) => !v)} className={`flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-900 ${agentMenu ? "text-slate-700 dark:text-slate-200" : ""}`}><Settings2 className="h-4 w-4" /></button>
			{agentMenu && <div role="menu" aria-label="Project Agent Management" className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
				<p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Project Agent</p>
				<a role="menuitem" href="/account/agent-control" className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"><ShieldCheck className="h-3.5 w-3.5 text-slate-500" />Agent Control Center</a>
				<a role="menuitem" href="/account/agent-skills" className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"><Sparkles className="h-3.5 w-3.5 text-slate-500" />Skill Registry</a>
				<a role="menuitem" href="/account/agent-workflows" className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"><Workflow className="h-3.5 w-3.5 text-slate-500" />Workflow Builder</a>
				<a role="menuitem" href="/account/agent-harness" className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"><FlaskConical className="h-3.5 w-3.5 text-slate-500" />Harness Lab</a>
			</div>}
		</div>
		<ProjectChatMenu title={conversation.title} pinned={conversation.pinned} canEdit onRename={() => setRenaming(conversation.title)} onTogglePin={() => void actions.setPinned(conversation, !conversation.pinned)} onDelete={() => setConfirmDelete(true)} onViewFiles={() => setPanel(true)} moveTargets={moveTargets} onMove={(target) => void actions.move(conversation, target)} />
		<ProjectAgentFilesPanel open={panel} onClose={() => setPanel(false)} projectId={projectId} tasks={tasks} conversationId={conversation.conversationId} fileUrl={fileUrl} />
		{renaming !== null && createPortal(<div role="dialog" aria-modal="true" aria-label="Rename chat" className={modal}><form className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900" onSubmit={(event) => { event.preventDefault(); const title = renaming.trim(); setRenaming(null); if (title && title !== conversation.title) void actions.rename(conversation, title); }}>
			<p className="mb-2 text-sm font-semibold">Rename chat</p>
			<input autoFocus value={renaming} onChange={(event) => setRenaming(event.target.value)} aria-label="Chat title" className="w-full rounded-xl border border-slate-200 p-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
			<div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setRenaming(null)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600">Cancel</button><button type="submit" className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white">Save</button></div>
		</form></div>, document.body)}
		{confirmDelete && createPortal(<div role="dialog" aria-modal="true" aria-label="Delete chat" className={modal}><div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900">
			<p className="text-sm font-semibold">Delete &ldquo;{conversation.title}&rdquo;?</p><p className="mt-1 text-sm text-slate-500">This removes the chat and its files.</p>
			<div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600">Cancel</button><button type="button" onClick={() => { setConfirmDelete(false); void actions.remove(conversation); }} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white">Delete</button></div>
		</div></div>, document.body)}
		{actions.error && <p role="alert" className="absolute right-4 top-14 text-xs text-red-600">{actions.error}</p>}
	</div>;
}
