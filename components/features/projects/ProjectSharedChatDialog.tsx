"use client";

import { useEffect, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { startSharedChatBranch } from "@/lib/projects/start-shared-chat-branch";

type ChatMessage = { id: string; query?: string; answer?: string; created_at?: number; message_files?: { name?: string; url?: string }[] };

export function ProjectSharedChatDialog({
	projectId,
	conversationId,
	title,
	userEmail,
	onClose,
}: {
	projectId: string;
	conversationId: string;
	title: string;
	userEmail: string;
	onClose: () => void;
}) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [branchError, setBranchError] = useState("");
	const [followUp, setFollowUp] = useState("");
	const [startingBranch, setStartingBranch] = useState(false);

	async function startBranch(event: FormEvent) {
		event.preventDefault();
		if (!followUp.trim() || startingBranch || loading || error) return;
		setStartingBranch(true);
		setBranchError("");
		let started = false;
		try {
			await startSharedChatBranch({ projectId, userEmail, messages, followUp });
			setFollowUp("");
			started = true;
		} catch (cause) {
			setBranchError(cause instanceof Error ? cause.message : "Could not start this Project chat branch");
		} finally {
			setStartingBranch(false);
			if (started) onClose();
		}
	}

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError("");
		fetch(`/api/projects/${encodeURIComponent(projectId)}/chats/${encodeURIComponent(conversationId)}`)
			.then(async (response) => {
				const body = await response.json().catch(() => ({}));
				if (!response.ok) throw new Error(body.error ?? "Could not load this Project chat");
				if (!cancelled) setMessages(Array.isArray(body.data) ? body.data : []);
			})
			.catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load this Project chat"); })
			.finally(() => { if (!cancelled) setLoading(false); });
		return () => { cancelled = true; };
	}, [projectId, conversationId]);

	return (
		<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>Shared Project chat · read-only preview</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0 flex-1 rounded-md border border-slate-200 p-4 dark:border-slate-700">
					{loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : error ? (
						<p role="alert" className="py-6 text-center text-sm text-red-600">{error}</p>
					) : messages.map((message) => <article key={message.id} className="mb-5 space-y-2 last:mb-0">
						{message.query && <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800"><p className="mb-1 text-[10px] font-semibold uppercase text-slate-500">User</p><p className="whitespace-pre-wrap">{message.query}</p></div>}
						{message.answer && <div className="px-1 text-sm leading-relaxed"><p className="mb-1 text-[10px] font-semibold uppercase text-orange-600">Assistant</p><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.answer}</ReactMarkdown></div>}
						{message.message_files?.map((file) => file.url && <a key={file.url} href={file.url} target="_blank" rel="noreferrer" className="block text-xs text-orange-600 underline">{file.name || "Open attachment"}</a>)}
					</article>)}
					{!loading && !error && messages.length === 0 && <p className="py-6 text-center text-sm text-slate-500">This chat has no messages.</p>}
				</ScrollArea>
				<form onSubmit={(event) => void startBranch(event)} className="space-y-2 border-t pt-3">
					<label htmlFor="shared-chat-follow-up" className="text-xs font-medium">Continue in a new Project chat</label>
					<div className="flex gap-2">
						<input id="shared-chat-follow-up" value={followUp} onChange={(event) => setFollowUp(event.target.value)} placeholder="Ask a follow-up based on this chat" disabled={loading || !!error || startingBranch} className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
						<button type="submit" disabled={!followUp.trim() || loading || !!error || startingBranch} className="rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{startingBranch ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start branch"}</button>
					</div>
					{branchError && <p role="alert" className="text-xs text-red-600">{branchError}</p>}
				</form>
			</DialogContent>
		</Dialog>
	);
}
