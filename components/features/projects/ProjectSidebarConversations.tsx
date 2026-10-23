"use client";

import { useEffect, useMemo, useState } from "react";
import { Pin } from "lucide-react";
import { useMessageStore } from "@/stores/useMessageStore";
import { useProjectStore, type ProjectConversation, type ProjectListItem } from "@/stores/useProjectStore";
import type { ChatSessionListItem } from "@/types/chat-sessions.types";
import { clearProjectAgentView } from "@/lib/project-agent/view-session";
import { startProjectChat } from "./startProjectChat";
import { ProjectAgentSidebarChats } from "./ProjectAgentSidebarChats";
import { ProjectChatMenu } from "./ProjectChatMenu";
import { ProjectSharedChatDialog } from "./ProjectSharedChatDialog";

const SHOW_LIMIT = 5;
const sessionsChanged = () => window.dispatchEvent(new CustomEvent("project-chat-sessions-changed"));
type SidebarProject = Pick<ProjectListItem, "id">;

function relativeTime(ms: number): string {
	const days = Math.floor((Date.now() - ms) / 86_400_000);
	if (days === 0) return "Today";
	if (days < 7) return `${days}d`;
	if (days < 30) return `${Math.floor(days / 7)}w`;
	return `${Math.floor(days / 30)}mo`;
}

export function ProjectSidebarConversations({ project, email }: { project: SidebarProject; email: string }) {
	const activeProjectId = useProjectStore((state) => state.activeProjectId);
	const links = useProjectStore((state) => state.conversations).filter((link) => link.projectId === project.id);
	const allProjects = useProjectStore((state) => state.projects);
	const unlinkConversation = useProjectStore((state) => state.unlinkConversation);
	const linkConversation = useProjectStore((state) => state.linkConversation);
	const messages = useMessageStore((state) => state.conversations);
	const currentConversationId = useMessageStore((state) => state.currentConversationId);
	const [sessions, setSessions] = useState<Record<string, ChatSessionListItem>>({});
	const [reload, setReload] = useState(0);
	const [expanded, setExpanded] = useState(false);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [sharedChat, setSharedChat] = useState<{ projectId: string; conversationId: string; title: string } | null>(null);
	const ids = useMemo(() => links.map((link) => link.conversationId).sort().join(","), [links]);
	const moveTargets = allProjects.filter((item) => item.id !== project.id && item.sharedRole !== "CHAT").map(({ id, name }) => ({ id, name }));

	useEffect(() => {
		const bump = () => setReload((value) => value + 1);
		window.addEventListener("project-chat-sessions-changed", bump);
		return () => window.removeEventListener("project-chat-sessions-changed", bump);
	}, []);
	useEffect(() => {
		if (!ids) { setSessions({}); return; }
		const controller = new AbortController();
		const query = new URLSearchParams({ limit: "100", category: "CHAT_KEY", conversationIds: ids });
		fetch(`/api/chat-sessions?${query}`, { signal: controller.signal })
			.then((response) => response.ok ? response.json() : { items: [] })
			.then((page: { items?: ChatSessionListItem[] }) => {
				if (!controller.signal.aborted) setSessions(Object.fromEntries((page.items ?? []).map((item) => [item.difyConversationId, item])));
			})
			.catch(() => {});
		return () => controller.abort();
	}, [ids, reload]);

	const startNewChat = () => startProjectChat(project.id);
	// Cmd/Ctrl+Shift+O starts a new chat in the active project (same shortcut as ChatGPT).
	useEffect(() => {
		if (activeProjectId !== project.id) return;
		const onKey = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== "o") return;
			event.preventDefault();
			startNewChat();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeProjectId, project.id]);
	const openChat = (link: ProjectConversation, title: string) => {
		if (!email) return;
		clearProjectAgentView(link.projectId);
		if (link.createdByEmail && link.createdByEmail.toLowerCase() !== email.toLowerCase()) {
			setSharedChat({ projectId: link.projectId, conversationId: link.conversationId, title });
			return;
		}
		useMessageStore.getState().setSelectedCategory("CHAT_KEY");
		void useMessageStore.getState().loadMessagesByConversationId(link.conversationId, email);
		useMessageStore.getState().setTitleNewChat(title);
	};
	const patchSession = async (conversationId: string, body: { title?: string; pinned?: boolean }) => {
		const session = sessions[conversationId];
		if (!session) return;
		setError("");
		const response = await fetch(`/api/chat-sessions/${encodeURIComponent(session.id)}`, {
			method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(payload.error || "Could not update this chat");
		sessionsChanged();
	};
	const removeFromProject = async (conversationId: string) => {
		setError("");
		try { await unlinkConversation(conversationId); }
		catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove this chat from the project"); }
	};
	const moveChat = async (conversationId: string, targetProjectId: string) => {
		setError("");
		try {
			const response = await fetch("/api/conversation-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, projectId: targetProjectId, category: "CHAT_KEY", linkedAt: Date.now() }) });
			if (!response.ok) throw new Error("Could not move this chat");
			linkConversation(conversationId, targetProjectId, "CHAT_KEY");
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not move this chat"); }
	};
	const deleteChat = async (conversationId: string) => {
		const session = sessions[conversationId];
		setConfirmDeleteId(null);
		if (!session) return;
		setError("");
		try {
			const response = await fetch(`/api/chat-sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" });
			if (!response.ok) throw new Error("Could not delete this chat");
			await unlinkConversation(conversationId);
			sessionsChanged();
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete this chat"); }
	};

	const sorted = [...links].sort((left, right) => Number(Boolean(sessions[right.conversationId]?.pinned)) - Number(Boolean(sessions[left.conversationId]?.pinned)) || right.linkedAt - left.linkedAt);
	const visible = expanded ? sorted : sorted.slice(0, SHOW_LIMIT);
	return <div className="mt-0.5 flex flex-col gap-0.5 pl-4">
		{error && <p role="alert" className="px-2 py-1 text-[10px] text-red-600">{error}</p>}
		{visible.map((link) => {
			const session = sessions[link.conversationId];
			const title = session?.title || messages.find((item) => item.id === link.conversationId)?.name || `Chat ${link.conversationId.slice(-6)}`;
			const isCurrent = currentConversationId === link.conversationId;
			return <div key={link.conversationId} className={`group flex min-w-0 items-center gap-0.5 rounded-md ${isCurrent ? "bg-slate-200/60 text-slate-900 dark:bg-slate-800 dark:text-slate-100" : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60"}`}>
				{renamingId === link.conversationId ? <input autoFocus aria-label="Chat title" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onBlur={() => { const value = renameValue.replace(/\s+/g, " ").trim(); setRenamingId(null); if (value && value !== title) void patchSession(link.conversationId, { title: value }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not rename this chat")); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setRenameValue(title); setRenamingId(null); } }} className="my-0.5 min-w-0 flex-1 rounded border border-orange-300 bg-transparent px-2 py-1 text-[13px] outline-none" />
					: confirmDeleteId === link.conversationId ? <div className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1"><span className="min-w-0 flex-1 truncate text-[10px] text-red-600">Delete chat?</span><button type="button" onClick={() => void deleteChat(link.conversationId)} className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] text-white">Delete</button><button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded px-1.5 py-0.5 text-[10px] text-slate-500">Cancel</button></div>
					: <button type="button" onClick={() => openChat(link, title)} title={title} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[13px]"><span className="min-w-0 flex-1 truncate">{title}</span><span className="shrink-0 text-[9px] text-slate-400">{relativeTime(link.linkedAt)}</span>{session?.pinned && <Pin className="h-3 w-3 shrink-0 fill-current text-orange-600" aria-label="Pinned" />}</button>}
				<ProjectChatMenu align="left" title={title} pinned={Boolean(session?.pinned)} canEdit={Boolean(session)} onRename={() => { setRenameValue(title); setRenamingId(link.conversationId); }} onTogglePin={() => void patchSession(link.conversationId, { pinned: !session?.pinned }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not pin this chat"))} onRemove={() => void removeFromProject(link.conversationId)} onDelete={() => setConfirmDeleteId(link.conversationId)} moveTargets={moveTargets} onMove={(target) => void moveChat(link.conversationId, target)} />
			</div>;
		})}
		{sorted.length > SHOW_LIMIT && <button type="button" onClick={() => setExpanded((value) => !value)} className="w-full px-2 py-1 text-left text-[13px] text-slate-400 transition-colors hover:text-orange-500">{expanded ? "Show less" : `+${sorted.length - SHOW_LIMIT} more`}</button>}
		{<ProjectAgentSidebarChats projectId={project.id} />}
		{sharedChat && <ProjectSharedChatDialog {...sharedChat} userEmail={email} onClose={() => setSharedChat(null)} />}
	</div>;
}
