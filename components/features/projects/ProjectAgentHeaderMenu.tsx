"use client";
import { useProjectStore } from "@/stores/useProjectStore";

import { useState } from "react";
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
	const actions = useProjectAgentChatActions(projectId, () => { clearProjectAgentConversationId(projectId); clearProjectAgentView(projectId); });
	const conversation = tasks.length ? groupProjectAgentTasks(tasks).at(-1) : undefined;
	if (!conversation || !tasks[0]?.canContinue) return null;
	const modal = "fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4";
	return <div className="ml-auto">
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
