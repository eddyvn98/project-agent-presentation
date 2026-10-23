"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Loader2, MessageSquare } from "lucide-react";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";
import { selectProjectAgentView } from "@/lib/project-agent/view-session";
import { setProjectAgentConversationId } from "@/lib/project-agent/conversation-session";
import { useMessageStore } from "@/stores/useMessageStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { ProjectAgentFilePreview } from "./ProjectAgentFilePreview";

type TaskFile = NonNullable<PublicProjectAgentTask["files"]>[number];
type Row = { task: PublicProjectAgentTask; file: TaskFile };

const formatSize = (bytes: number) => bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const chatLabel = (task: PublicProjectAgentTask) => (task.userPrompt ?? task.prompt).replace(/\s+/g, " ").trim().slice(0, 70);

/** Every file the agent produced in any chat of this project, newest first, so nobody has to dig through chats. */
export function ProjectFilesList({ projectId }: { projectId: string }) {
	const refreshProject = useProjectStore((state) => state.refreshProject);
	const [tasks, setTasks] = useState<PublicProjectAgentTask[]>([]);
	const [cursor, setCursor] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [saving, setSaving] = useState<string | null>(null);

	const load = async (after?: string | null, signal?: AbortSignal) => {
		const query = new URLSearchParams({ limit: "20", ...(after ? { cursor: after } : {}) });
		const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks?${query}`, { signal });
		if (!response.ok) throw new Error("Could not load files");
		const data = await response.json() as { tasks?: PublicProjectAgentTask[]; nextCursor?: string | null };
		setTasks((current) => {
			const known = new Set(current.map((task) => task.id));
			return [...current, ...(data.tasks ?? []).filter((task) => !known.has(task.id))];
		});
		setCursor(data.nextCursor ?? null);
	};

	useEffect(() => {
		const controller = new AbortController();
		setLoading(true);
		setTasks([]);
		load(null, controller.signal).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load files"); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
		return () => controller.abort();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [projectId]);

	const rows: Row[] = tasks.flatMap((task) => (task.files ?? []).map((file) => ({ task, file })));

	const openChat = (task: PublicProjectAgentTask) => {
		if (task.conversationId) setProjectAgentConversationId(projectId, task.conversationId);
		useMessageStore.getState().clearMessages();
		selectProjectAgentView(projectId, task.conversationId ?? task.id);
	};

	const save = async ({ task, file }: Row) => {
		setSaving(`${task.id}/${file.id}`);
		setError("");
		try {
			const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(task.id)}/files/${encodeURIComponent(file.id)}/save`, { method: "POST" });
			const payload = await response.json().catch(() => ({})) as { fileId?: string; error?: string };
			if (!response.ok || !payload.fileId) throw new Error(payload.error || "Could not save file");
			setTasks((current) => current.map((item) => item.id !== task.id ? item : { ...item, files: item.files?.map((f) => f.id === file.id ? { ...f, savedToProjectFileId: payload.fileId } : f) }));
			await refreshProject(projectId).catch(() => {});
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not save file");
		} finally {
			setSaving(null);
		}
	};

	if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-label="Loading files" /></div>;
	return <section aria-label="Files created in this project" className="px-1">
		{error && <p role="alert" className="py-2 text-sm text-red-600">{error}</p>}
		{rows.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">Files the agent creates in any chat of this project appear here.</p> : <ul className="divide-y divide-slate-100 dark:divide-slate-800">
			{rows.map((row) => {
				const { task, file } = row;
				const url = file.savedToProjectFileId
					? `/api/projects/${encodeURIComponent(projectId)}/knowledge/original?fileId=${encodeURIComponent(file.savedToProjectFileId)}`
					: `/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(task.id)}/files/${encodeURIComponent(file.id)}`;
				return <li key={`${task.id}/${file.id}`} className="flex flex-wrap items-center gap-3 px-3 py-3">
					<FileText className="h-5 w-5 shrink-0 text-slate-400" />
					<span className="min-w-0 flex-1">
						<span className="block truncate text-[15px] text-slate-900 dark:text-slate-100">{file.name}</span>
						<span className="block truncate text-xs text-slate-500">{formatSize(file.size)} · {new Date(task.createdAt).toLocaleDateString()} · {chatLabel(task)}</span>
					</span>
					{task.status !== "done" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">Unverified draft</span>}
					<ProjectAgentFilePreview projectId={projectId} taskId={task.id} file={file} conversationId={task.conversationId} />
					<a href={url} aria-label={`Download ${file.name}`} className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Download className="h-4 w-4" /></a>
					<button type="button" onClick={() => openChat(task)} aria-label="Open the chat that created this file" className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><MessageSquare className="h-4 w-4" /></button>
					{file.savedToProjectFileId ? <span className="text-xs text-emerald-700 dark:text-emerald-300">In Sources</span> : task.status === "done" ? <button type="button" disabled={saving !== null} onClick={() => void save(row)} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{saving === `${task.id}/${file.id}` ? "Saving…" : "Add to Sources"}</button> : null}
				</li>;
			})}
		</ul>}
		{cursor && <button type="button" onClick={() => void load(cursor).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load files"))} className="mt-2 w-full rounded-lg px-3 py-2 text-sm text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950/30">Load older</button>}
	</section>;
}
