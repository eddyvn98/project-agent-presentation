"use client";

import { useState } from "react";
import { Pin, Sparkles } from "lucide-react";
import type { ProjectAgentConversation } from "@/lib/project-agent/conversations";
import { clearProjectAgentView, selectProjectAgentView } from "@/lib/project-agent/view-session";
import { clearProjectAgentConversationId, getProjectAgentConversationId, setProjectAgentConversationId } from "@/lib/project-agent/conversation-session";
import { useMessageStore } from "@/stores/useMessageStore";
import { ProjectChatMenu } from "./ProjectChatMenu";
import { useProjectAgentChatActions } from "./useProjectAgentChatActions";

export function ProjectAgentChatRow({ projectId, conversation, moveTargets }: { projectId: string; conversation: ProjectAgentConversation; moveTargets: Array<{ id: string; name: string }> }) {
	const [renaming, setRenaming] = useState(false);
	const [value, setValue] = useState("");
	const [confirmDelete, setConfirmDelete] = useState(false);
	const actions = useProjectAgentChatActions(projectId, (removed) => {
		if (removed.conversationId && getProjectAgentConversationId(projectId) === removed.conversationId) {
			clearProjectAgentConversationId(projectId);
			clearProjectAgentView(projectId);
		}
	});
	const first = conversation.tasks[0];
	const latest = conversation.tasks.at(-1)!;
	const open = () => {
		if (conversation.conversationId) setProjectAgentConversationId(projectId, conversation.conversationId);
		useMessageStore.getState().clearMessages();
		selectProjectAgentView(projectId, conversation.conversationId ?? first.id);
	};
	// Second line like ChatGPT: the start of the latest answer (markdown stripped), or what the agent is doing.
	const previewSource = latest.resultText || latest.partialText || "";
	const preview = previewSource.replace(/```[\s\S]*?```/g, " ").replace(/[*_`#>|]+/g, "").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim().slice(0, 140);
	const running = conversation.tasks.some((task) => task.status === "queued" || task.status === "running");
	const statusLabel = running ? "Working" : latest.status === "failed" ? "Failed" : latest.status === "done" ? "Done" : "Queued";
	const statusClass = running
		? "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300"
		: latest.status === "failed"
			? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
			: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
	return <li className="group flex items-center gap-2 px-4 py-1 hover:bg-slate-50 focus-within:bg-slate-50 dark:hover:bg-slate-800/60 dark:focus-within:bg-slate-800/60">
		{renaming ? <input autoFocus aria-label="Chat title" value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => { const title = value.trim(); setRenaming(false); if (title && title !== conversation.title) void actions.rename(conversation, title); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setValue(conversation.title); setRenaming(false); } }} className="my-1 min-w-0 flex-1 rounded-md border border-orange-300 bg-transparent px-2 py-1.5 text-sm outline-none" />
		: confirmDelete ? <div className="flex min-w-0 flex-1 items-center gap-2 py-2 text-sm"><span className="min-w-0 flex-1 truncate text-red-600">Delete &ldquo;{conversation.title}&rdquo;?</span><button type="button" onClick={() => { setConfirmDelete(false); void actions.remove(conversation); }} className="rounded-md bg-red-600 px-3 py-1 text-xs text-white">Delete</button><button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md px-3 py-1 text-xs text-slate-600 hover:bg-slate-100">Cancel</button></div>
		: <button type="button" onClick={open} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left"><Sparkles className="h-4 w-4 shrink-0 text-orange-500" /><span className="min-w-0 flex-1"><span className="block truncate text-sm text-slate-800 dark:text-slate-100">{conversation.title}</span>{preview && <span className="mt-0.5 block truncate text-xs text-slate-500">{preview}</span>}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass}`}>{statusLabel}</span>{latest.files?.length ? <span className="shrink-0 text-xs text-slate-500">{latest.files.length} {latest.files.length === 1 ? "file" : "files"}</span> : null}<span className="shrink-0 text-xs text-slate-400">{new Date(latest.updatedAt).toLocaleDateString()}</span></button>}
		{conversation.pinned && <Pin className="h-3.5 w-3.5 shrink-0 fill-current text-orange-600" aria-label="Pinned" />}
		{first.canContinue && <ProjectChatMenu title={conversation.title} pinned={conversation.pinned} canEdit onRename={() => { setValue(conversation.title); setRenaming(true); }} onTogglePin={() => void actions.setPinned(conversation, !conversation.pinned)} onDelete={() => setConfirmDelete(true)} moveTargets={moveTargets} onMove={(target) => void actions.move(conversation, target)} />}
	</li>;
}
