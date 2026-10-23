"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { Folder, MessageSquare, Pin, PinOff, Search, Settings, Upload } from "lucide-react";
import { useProjectStore } from "@/stores/useProjectStore";
import { useMessageStore } from "@/stores/useMessageStore";
import { clearProjectAgentFileContext, clearProjectAgentView, NEW_PROJECT_AGENT_VIEW_ID, selectProjectAgentView, setProjectAgentInitialPrompt } from "@/lib/project-agent/view-session";
import { ProjectModal } from "./ProjectModal";
import { ProjectAgentChatRow } from "./ProjectAgentChatRow";
import { useProjectAgentConversations } from "./useProjectAgentConversations";
import { ProjectConversationManager } from "./ProjectConversationManager";
import { ProjectSourcesList } from "./ProjectSourcesList";
import { ProjectFilesList } from "./ProjectFilesList";
import { ProjectRowMenu } from "./ProjectRowMenu";
import { ProjectChatMenu } from "./ProjectChatMenu";
import { ProjectAgentAttachmentChip } from "./ProjectAgentAttachmentChip";
import { ProjectAgentComposer } from "./ProjectAgentComposer";
import type { ChatSessionListItem } from "@/types/chat-sessions.types";

type Tab = "chats" | "files" | "sources";

export function ProjectWorkspaceHome() {
	const { data: session } = useSession();
	const projectId = useProjectStore((state) => state.activeProjectId);
	const project = useProjectStore((state) => projectId ? state.getProjectById(projectId) : null);
	const links = useProjectStore((state) => state.conversations);
	const conversations = useMessageStore((state) => state.conversations);
	const [tab, setTab] = useState<Tab>("chats");
	const [editing, setEditing] = useState(false);
	const [starterPrompt, setStarterPrompt] = useState("");
	const [starterFiles, setStarterFiles] = useState<File[]>([]);
	const starterFileInputRef = useRef<HTMLInputElement>(null);
	const [chatSessions, setChatSessions] = useState<Record<string, ChatSessionListItem>>({});
	const [pinningConversationId, setPinningConversationId] = useState<string | null>(null);
	const [chatActionError, setChatActionError] = useState("");
	const [chatQuery, setChatQuery] = useState("");
	const updateProject = useProjectStore((state) => state.updateProject);
	const [settingsTab, setSettingsTab] = useState<"sharing" | null>(null);
	const agentChats = useProjectAgentConversations(projectId, chatQuery);
	const searchRef = useRef<HTMLInputElement>(null);
	const [fileHits, setFileHits] = useState<Array<{ name: string; snippet: string }>>([]);
	useEffect(() => {
		const q = chatQuery.trim();
		if (!projectId || q.length < 2) { setFileHits([]); return; }
		const controller = new AbortController();
		const timer = window.setTimeout(() => {
			fetch(`/api/projects/${encodeURIComponent(projectId)}/search?${new URLSearchParams({ q })}`, { signal: controller.signal })
				.then((response) => response.ok ? response.json() : { files: [] })
				.then((data: { files?: Array<{ name: string; snippet: string }> }) => setFileHits(data.files ?? []))
				.catch(() => {});
		}, 350);
		return () => { window.clearTimeout(timer); controller.abort(); };
	}, [chatQuery, projectId]);
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
			if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
			if (!searchRef.current) return;
			event.preventDefault();
			searchRef.current.focus();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const allProjects = useProjectStore((state) => state.projects);
	const linkConversation = useProjectStore((state) => state.linkConversation);
	const addKnowledgeFile = useProjectStore((state) => state.addKnowledgeFile);
	const [dragging, setDragging] = useState(false);
	const [dropError, setDropError] = useState("");
	const unlinkConversation = useProjectStore((state) => state.unlinkConversation);
	const projectLinks = useMemo(() => projectId ? links.filter((item) => item.projectId === projectId) : [], [links, projectId]);
	const conversationIds = useMemo(() => projectLinks.map((link) => link.conversationId).sort().join(","), [projectLinks]);
	const orderedProjectLinks = useMemo(() => [...projectLinks].sort((left, right) => {
		const leftPinned = chatSessions[left.conversationId]?.pinned ? 1 : 0;
		const rightPinned = chatSessions[right.conversationId]?.pinned ? 1 : 0;
		return rightPinned - leftPinned || right.linkedAt - left.linkedAt;
	}), [chatSessions, projectLinks]);

	useEffect(() => {
		if (!conversationIds) { setChatSessions({}); return; }
		const controller = new AbortController();
		const query = new URLSearchParams({ limit: "100", category: "CHAT_KEY", conversationIds });
		fetch(`/api/chat-sessions?${query}`, { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) throw new Error("Could not load Project chat actions");
				return response.json() as Promise<{ items?: ChatSessionListItem[] }>;
			})
			.then((page) => {
				if (controller.signal.aborted) return;
				setChatSessions(Object.fromEntries((page.items ?? []).map((item) => [item.difyConversationId, item])));
			})
			.catch(() => { if (!controller.signal.aborted) setChatActionError("Chat actions are temporarily unavailable."); });
		return () => controller.abort();
	}, [conversationIds]);
	const needle = chatQuery.trim().toLowerCase();
	const visibleProjectLinks = needle ? orderedProjectLinks.filter((link) => (chatSessions[link.conversationId]?.title || conversations.find((item) => item.id === link.conversationId)?.name || "").toLowerCase().includes(needle)) : orderedProjectLinks;
	const mergedChats = [
		...visibleProjectLinks.map((link) => ({ kind: "chat" as const, key: `chat:${link.conversationId}`, pinned: Boolean(chatSessions[link.conversationId]?.pinned), ts: link.linkedAt, link })),
		...agentChats.conversations.map((conversation) => ({ kind: "agent" as const, key: `agent:${conversation.id}`, pinned: conversation.pinned, ts: Date.parse(conversation.tasks.at(-1)!.updatedAt), conversation })),
	].sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.ts - left.ts);
	if (!projectId || !project) return null;
	const canEditProject = project.sharedRole !== "CHAT";

	const startAgentChat = (prompt: string) => {
		setProjectAgentInitialPrompt(projectId, prompt.trim(), starterFiles);
		clearProjectAgentFileContext(projectId);
		useMessageStore.getState().clearMessages();
		useMessageStore.getState().setTitleNewChat("New Project chat");
		sessionStorage.removeItem("conversation_id");
		sessionStorage.removeItem("conversation_category");
		sessionStorage.removeItem("conversation_user");
		selectProjectAgentView(projectId, NEW_PROJECT_AGENT_VIEW_ID);
	};
	const submitStarterPrompt = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (starterPrompt.trim() || starterFiles.length) startAgentChat(starterPrompt.trim() || `Review the attached file${starterFiles.length === 1 ? "" : "s"} and help me understand ${starterFiles.length === 1 ? "it" : "them"}.`);
	};
	const openChat = (conversationId: string, title: string) => {
		const email = session?.user?.email;
		if (!email) return;
		clearProjectAgentView(projectId);
		useMessageStore.getState().setSelectedCategory("CHAT_KEY");
		void useMessageStore.getState().loadMessagesByConversationId(conversationId, email);
		useMessageStore.getState().setTitleNewChat(title);
	};
	const togglePin = async (conversationId: string) => {
		const session = chatSessions[conversationId];
		if (!session || pinningConversationId) return;
		const pinned = !session.pinned;
		setPinningConversationId(conversationId);
		setChatActionError("");
		setChatSessions((current) => ({ ...current, [conversationId]: { ...session, pinned } }));
		try {
			const response = await fetch(`/api/chat-sessions/${encodeURIComponent(session.id)}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ pinned }),
			});
			if (!response.ok) throw new Error("Could not update this Project chat");
		} catch (cause) {
			setChatSessions((current) => ({ ...current, [conversationId]: session }));
			setChatActionError(cause instanceof Error ? cause.message : "Could not update this Project chat");
		} finally { setPinningConversationId(null); }
	};

	const dropFiles = async (files: File[]) => {
		setDropError("");
		for (const file of files) {
			try { await addKnowledgeFile(projectId, file); }
			catch (cause) { setDropError(cause instanceof Error ? cause.message : `Could not upload ${file.name}`); }
		}
	};
	const notifySessionsChanged = () => window.dispatchEvent(new CustomEvent("project-chat-sessions-changed"));
	const submitRename = async (conversationId: string) => {
		const chat = chatSessions[conversationId];
		const title = renameValue.replace(/\s+/g, " ").trim();
		setRenamingId(null);
		if (!chat || !title || title === chat.title) return;
		setChatSessions((current) => ({ ...current, [conversationId]: { ...chat, title } }));
		try {
			const response = await fetch(`/api/chat-sessions/${encodeURIComponent(chat.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
			if (!response.ok) throw new Error("Could not rename this chat");
			notifySessionsChanged();
		} catch (cause) {
			setChatSessions((current) => ({ ...current, [conversationId]: chat }));
			setChatActionError(cause instanceof Error ? cause.message : "Could not rename this chat");
		}
	};
	const moveTargets = allProjects.filter((item) => item.id !== projectId && item.sharedRole !== "CHAT").map((item) => ({ id: item.id, name: item.name }));
	const moveChat = async (conversationId: string, targetProjectId: string) => {
		setChatActionError("");
		try {
			const response = await fetch("/api/conversation-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, projectId: targetProjectId, category: "CHAT_KEY", linkedAt: Date.now() }) });
			if (!response.ok) throw new Error("Could not move this chat");
			linkConversation(conversationId, targetProjectId, "CHAT_KEY");
		} catch (cause) {
			setChatActionError(cause instanceof Error ? cause.message : "Could not move this chat");
		}
	};
	const deleteChat = async (conversationId: string) => {
		const chat = chatSessions[conversationId];
		setConfirmDeleteId(null);
		if (!chat) return;
		try {
			const response = await fetch(`/api/chat-sessions/${encodeURIComponent(chat.id)}`, { method: "DELETE" });
			if (!response.ok) throw new Error("Could not delete this chat");
			await unlinkConversation(conversationId);
			notifySessionsChanged();
		} catch (cause) {
			setChatActionError(cause instanceof Error ? cause.message : "Could not delete this chat");
		}
	};
	const removeChatFromProject = async (conversationId: string) => {
		setChatActionError("");
		try { await unlinkConversation(conversationId); }
		catch (cause) { setChatActionError(cause instanceof Error ? cause.message : "Could not remove this chat from the project"); }
	};

	return <main className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-y-auto px-4 py-5 sm:overflow-hidden sm:px-8 sm:py-8">
		<header className="mb-5 flex items-center justify-between gap-4">
			<h1 className="flex min-w-0 items-center gap-3 text-[28px] font-semibold tracking-tight text-slate-900 dark:text-slate-50"><Folder className="h-7 w-7 shrink-0" /><span className="truncate">{project.name}</span></h1>
			<div className="flex shrink-0 items-center gap-2">
				{!project.sharedRole ? <button type="button" onClick={() => { setSettingsTab("sharing"); setEditing(true); }} className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"><Upload className="h-4 w-4" />Share</button> : null}
				{canEditProject ? <div className="group"><ProjectRowMenu alwaysVisible label={project.name} items={[
					{ key: "settings", label: "Project settings", icon: <Settings className="h-4 w-4" />, onSelect: () => { setSettingsTab(null); setEditing(true); } },
					...(!project.sharedRole ? [{ key: "pin", label: project.pinned ? "Unpin project" : "Pin project", icon: project.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />, separatorBefore: true, onSelect: () => void updateProject(projectId, { pinned: !project.pinned }) }] : []),
				]} /></div> : null}
			</div>
		</header>

		<input ref={starterFileInputRef} type="file" multiple className="hidden" onChange={(event) => { const picked = Array.from(event.target.files ?? []); event.target.value = ""; if (picked.length) setStarterFiles((current) => [...current, ...picked]); }} />
		<div className="mb-6"><ProjectAgentComposer value={starterPrompt} onChange={setStarterPrompt} onSubmit={submitStarterPrompt} onAttach={() => starterFileInputRef.current?.click()} onFiles={(picked) => setStarterFiles((current) => [...current, ...picked])} placeholder={`New chat in ${project.name}`} ariaLabel={`Start a chat in ${project.name}`} attachLabel="Add files and images" sendLabel="Start project chat" allowEmptyValue={starterFiles.length > 0} attachments={starterFiles.length ? <>{starterFiles.map((file, index) => <ProjectAgentAttachmentChip key={`${file.name}-${index}`} file={file} onRemove={() => setStarterFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} />)}</> : undefined} /></div>

		<div className="mb-5 flex flex-wrap items-center gap-3">
			<div className="flex gap-1">
				{([ ["chats", "Chats"], ["files", "Files"], ["sources", "Sources"] ] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-full px-4 py-1.5 text-[15px] font-medium ${tab === id ? "bg-slate-200/70 text-slate-900 dark:bg-slate-800 dark:text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60"}`}>{label}</button>)}
			</div>
		</div>

		<div className="pb-6 sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
			{tab === "chats" ? <div className="space-y-6">
				<div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input ref={searchRef} value={chatQuery} onChange={(event) => setChatQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setChatQuery(""); event.currentTarget.blur(); } }} type="search" aria-label="Search project chats" placeholder="Search chats in this project (press /)" className="h-10 w-full rounded-xl border border-slate-200 bg-transparent pl-9 pr-3 text-sm outline-none focus:border-orange-300 dark:border-slate-700" /></div>
				{fileHits.length > 0 && <section aria-label="Matching project files" className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800"><h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Files matching &ldquo;{chatQuery.trim()}&rdquo;</h2></div><ul className="divide-y divide-slate-100 dark:divide-slate-800">{fileHits.map((hit) => <li key={hit.name} className="px-4 py-2.5"><button type="button" onClick={() => { setChatQuery(""); setTab("sources"); }} className="block w-full text-left"><span className="block truncate text-sm text-slate-800 dark:text-slate-100">{hit.name}</span><span className="mt-0.5 line-clamp-2 text-xs text-slate-500">{hit.snippet}</span></button></li>)}</ul></section>}
				{agentChats.error && <p role="alert" className="mb-2 text-sm text-red-600">{agentChats.error} <button type="button" onClick={agentChats.retry} className="underline">Retry loading chats</button></p>}
				{mergedChats.length > 0 && <section aria-label="Project chats">
					{chatActionError && <p role="status" className="px-4 py-2 text-xs text-amber-700 dark:text-amber-300">{chatActionError}</p>}
					<ul>{mergedChats.map((item) => {
						if (item.kind === "agent") return <ProjectAgentChatRow key={item.key} projectId={projectId} conversation={item.conversation} moveTargets={moveTargets} />;
						const link = item.link;
						const session = chatSessions[link.conversationId];
						const title = session?.title || conversations.find((item) => item.id === link.conversationId)?.name || `Chat ${link.conversationId.slice(-6)}`;
						return <li key={item.key} className="group flex items-center gap-2 px-4 py-1 hover:bg-slate-50 focus-within:bg-slate-50 dark:hover:bg-slate-800/60 dark:focus-within:bg-slate-800/60">{renamingId === link.conversationId ? <input autoFocus aria-label="Chat title" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={() => void submitRename(link.conversationId)} onKeyDown={(e) => { if (e.key === "Enter") void submitRename(link.conversationId); if (e.key === "Escape") setRenamingId(null); }} className="my-1 min-w-0 flex-1 rounded-md border border-orange-300 bg-transparent px-2 py-1.5 text-sm outline-none" /> : confirmDeleteId === link.conversationId ? <div className="flex min-w-0 flex-1 items-center gap-2 py-2 text-sm"><span className="min-w-0 flex-1 truncate text-red-600">Delete &ldquo;{title}&rdquo;?</span><button type="button" onClick={() => void deleteChat(link.conversationId)} className="rounded-md bg-red-600 px-3 py-1 text-xs text-white">Delete</button><button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-md px-3 py-1 text-xs text-slate-600 hover:bg-slate-100">Cancel</button></div> : <button type="button" onClick={() => openChat(link.conversationId, title)} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left"><MessageSquare className="h-4 w-4 shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-slate-100">{title}</span><span className="shrink-0 text-xs text-slate-400">{new Date(link.linkedAt).toLocaleDateString()}</span></button>}{session?.pinned && <Pin className="h-3.5 w-3.5 shrink-0 fill-current text-orange-600" aria-label="Pinned" />}<ProjectChatMenu title={title} pinned={Boolean(session?.pinned)} canEdit={Boolean(session)} onRename={() => { setRenameValue(title); setRenamingId(link.conversationId); }} onTogglePin={() => void togglePin(link.conversationId)} onRemove={() => void removeChatFromProject(link.conversationId)} onDelete={() => setConfirmDeleteId(link.conversationId)} moveTargets={moveTargets} onMove={(target) => void moveChat(link.conversationId, target)} /></li>;
					})}</ul>
				</section>}
				{agentChats.hasMore && <button type="button" disabled={agentChats.loadingMore} onClick={() => void agentChats.loadMore()} className="mx-auto block rounded-full border border-slate-200 px-5 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{agentChats.loadingMore ? "Loading older chats…" : "Load older Agent chats"}</button>}
				<div className="border-t border-slate-200 p-3 dark:border-slate-800"><ProjectConversationManager /></div>
			</div> : tab === "files" ? <ProjectFilesList projectId={projectId} /> : <div onDragOver={canEditProject ? (event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } } : undefined} onDragLeave={() => setDragging(false)} onDrop={canEditProject ? (event) => { event.preventDefault(); setDragging(false); void dropFiles(Array.from(event.dataTransfer.files)); } : undefined} className={`rounded-2xl ${dragging ? "bg-orange-50/60 ring-2 ring-orange-300 dark:bg-orange-950/20" : ""}`}>
				{dragging && <p className="px-4 py-2 text-center text-xs font-medium text-orange-700 dark:text-orange-300">Drop files to add them to this project</p>}
				{dropError && <p role="alert" className="px-4 py-2 text-xs text-red-600">{dropError}</p>}
				<ProjectSourcesList projectId={projectId} files={project.knowledgeFiles} canEdit={canEditProject} />
			</div>}
		</div>
		<ProjectModal open={editing} onClose={() => setEditing(false)} projectId={projectId} initialTab={settingsTab ?? (tab === "sources" ? "knowledge" : "details")} />
	</main>;
}
