"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FolderInput, Loader2, Plus, Search, X } from "lucide-react";
import { useProjectStore } from "@/stores/useProjectStore";
import { useMessageStore } from "@/stores/useMessageStore";
import type { ChatSessionListItem } from "@/types/chat-sessions.types";
import { shouldClearConversationForProjectChange, shouldDeactivateProjectAfterUnlink } from "@/lib/projects/conversation-project-context";

export function ProjectConversationManager({ showControl = true }: { showControl?: boolean }) {
	const activeProjectId = useProjectStore((state) => state.activeProjectId);
	const projects = useProjectStore((state) => state.projects);
	const links = useProjectStore((state) => state.conversations);
	const linkConversation = useProjectStore((state) => state.linkConversation);
	const unlinkConversationLocally = useProjectStore((state) => state.unlinkConversationLocally);
	const setActiveProject = useProjectStore((state) => state.setActiveProject);
	const refreshMemoryCache = useProjectStore((state) => state.refreshMemoryCache);
	const currentConversationId = useMessageStore((state) => state.currentConversationId);
	const recentConversations = useMessageStore((state) => state.conversations);
	const selectedCategory = useMessageStore((state) => state.selectedCategory);
	const clearMessages = useMessageStore((state) => state.clearMessages);
	const setTitleNewChat = useMessageStore((state) => state.setTitleNewChat);
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [chats, setChats] = useState<ChatSessionListItem[]>([]);
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const previousProjectId = useRef(activeProjectId);
	useEffect(() => {
		const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
		return () => window.clearTimeout(timer);
	}, [query]);

	useEffect(() => {
		if (previousProjectId.current === activeProjectId) return;
		previousProjectId.current = activeProjectId;
		const linkedProjectId = links.find((link) => link.conversationId === currentConversationId)?.projectId;
		if (shouldClearConversationForProjectChange(currentConversationId, linkedProjectId, activeProjectId)) {
			clearMessages();
			setTitleNewChat("New chat");
			sessionStorage.removeItem("conversation_id");
			sessionStorage.removeItem("conversation_category");
			sessionStorage.removeItem("conversation_user");
		}
	}, [activeProjectId, currentConversationId, links, clearMessages, setTitleNewChat]);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setLoading(true);
		setError("");
		fetch(`/api/chat-sessions?${new URLSearchParams({ limit: "100", category: "CHAT_KEY", ...(debouncedQuery ? { q: debouncedQuery } : {}) })}`)
			.then(async (response) => {
				if (!response.ok) throw new Error("Could not load recent chats");
				return response.json();
			})
			.then((page: { items?: ChatSessionListItem[] }) => {
				if (!cancelled) setChats(Array.isArray(page.items) ? page.items : []);
			})
			.catch((cause) => {
				if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load recent chats");
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => { cancelled = true; };
	}, [open, debouncedQuery]);

	const visibleChats = useMemo(() => {
		const needle = query.trim().toLowerCase();
		const listed = chats.length > 0 ? chats : selectedCategory === "CHAT_KEY"
			? recentConversations.map((conversation) => ({
				id: conversation.id,
				title: conversation.name,
				category: "CHAT_KEY" as const,
				region: null,
				updatedAt: new Date(conversation.created_at * 1000).toISOString(),
				pinned: false,
				difyConversationId: conversation.id,
			}))
			: [];
		return listed.filter((chat) => !needle || (chat.title || "New chat").toLowerCase().includes(needle));
	}, [chats, query, recentConversations, selectedCategory]);

	if (!activeProjectId || !showControl) return null;

	async function changeProject(chat: ChatSessionListItem, remove: boolean) {
		if (!activeProjectId || busyId) return;
		setBusyId(chat.difyConversationId);
		setError("");
		try {
			if (!remove && chat.id === chat.difyConversationId) {
				const sessionResponse = await fetch("/api/chat-sessions", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ category: "CHAT_KEY", difyConversationId: chat.difyConversationId, title: chat.title }),
				});
				if (!sessionResponse.ok) throw new Error("Could not prepare this chat for Project memory");
			}
			const endpoint = remove
				? `/api/conversation-links?conversationId=${encodeURIComponent(chat.difyConversationId)}`
				: "/api/conversation-links";
			const response = await fetch(endpoint, {
				method: remove ? "DELETE" : "POST",
				headers: remove ? undefined : { "Content-Type": "application/json" },
				...(!remove && { body: JSON.stringify({
						conversationId: chat.difyConversationId,
						projectId: activeProjectId,
						category: chat.category,
						linkedAt: Date.now(),
					}) }),
			});
			if (!response.ok) {
				const payload = await response.json().catch(() => ({}));
				throw new Error(payload.error || "Could not update this Project chat");
			}
			if (remove) {
				unlinkConversationLocally(chat.difyConversationId);
				if (shouldDeactivateProjectAfterUnlink(chat.difyConversationId, currentConversationId)) setActiveProject(null);
			} else linkConversation(chat.difyConversationId, activeProjectId, chat.category);
			void refreshMemoryCache(activeProjectId);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not update this Project chat");
		} finally {
			setBusyId(null);
		}
	}

	return (
		<div className="mx-2 mb-2">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-orange-600 dark:text-slate-400 dark:hover:bg-slate-800"
				aria-expanded={open}
			>
				<FolderInput className="h-3.5 w-3.5" />
				<span className="flex-1">Manage project chats</span>
				{open ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
			</button>
			{open && (
				<div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
					<div className="relative mb-2">
						<Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Find a recent chat"
							aria-label="Find a recent chat to add to this project"
							className="w-full rounded-md border border-slate-200 bg-transparent py-1.5 pl-7 pr-2 text-xs outline-none focus:border-orange-300 dark:border-slate-700"
						/>
					</div>
					{error && <p role="alert" className="mb-2 text-xs text-red-600">{error}</p>}
					{loading ? (
						<div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
					) : (
						<div className="max-h-52 space-y-1 overflow-y-auto">
							{visibleChats.map((chat) => {
								const link = links.find((item) => item.conversationId === chat.difyConversationId);
								const isInProject = link?.projectId === activeProjectId;
								const otherProject = link && !isInProject
									? projects.find((project) => project.id === link.projectId)?.name ?? "another project"
									: "";
								return (
									<div key={chat.id} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800">
										<span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-200" title={chat.title}>
											{chat.title || "New chat"}
											{otherProject && <span className="block truncate text-[10px] text-slate-400">In {otherProject}</span>}
										</span>
										<button
											type="button"
											disabled={busyId !== null}
											onClick={() => void changeProject(chat, isInProject)}
											className="shrink-0 rounded px-2 py-1 text-[10px] font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50 dark:hover:bg-orange-950/30"
										>
											{busyId === chat.difyConversationId ? <Loader2 className="h-3 w-3 animate-spin" /> : isInProject ? "Remove" : otherProject ? "Move here" : "Add"}
										</button>
									</div>
								);
							})}
							{visibleChats.length === 0 && <p className="px-1.5 py-3 text-center text-xs text-slate-400">No recent chats found</p>}
						</div>
					)}
					<p className="mt-2 border-t border-slate-100 pt-2 text-[10px] leading-relaxed text-slate-400 dark:border-slate-800">
						Project instructions, files, and recent linked chats inform the next message.
					</p>
				</div>
			)}
		</div>
	);
}
