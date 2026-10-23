"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bookmark, BookmarkCheck, Download, Loader2 } from "lucide-react";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";
import { createProjectResponseSource } from "@/lib/projects/project-response-source";
import { useProjectStore, type KnowledgeFile } from "@/stores/useProjectStore";
import { ProjectAgentFilePreview } from "./ProjectAgentFilePreview";
import { createProjectAgentMarkdownComponents, normalizeProjectAgentMarkdown } from "./ProjectAgentMarkdown";

const EMPTY_KNOWLEDGE_FILES: KnowledgeFile[] = [];
type Deliverable = {
	task: PublicProjectAgentTask;
	file: NonNullable<PublicProjectAgentTask["files"]>[number] | null;
	key: string;
};

function resultSourceName(taskId: string) {
	return `Project Agent result ${taskId}.md`;
}

function statusLabel(task: PublicProjectAgentTask) {
	if (task.status === "running") return "Working";
	if (task.status === "queued") return "Queued";
	if (task.status === "failed") return task.files?.length || task.resultText ? "Unverified draft" : "Failed";
	return "Complete";
}

export function ProjectAgentHistory({ filter = "" }: { filter?: string }) {
	const projectId = useProjectStore((state) => state.activeProjectId);
	const addKnowledgeFile = useProjectStore((state) => state.addKnowledgeFile);
	const refreshProject = useProjectStore((state) => state.refreshProject);
	const knowledgeFiles = useProjectStore((state) => projectId
		? state.getProjectById(projectId)?.knowledgeFiles
		: undefined) ?? EMPTY_KNOWLEDGE_FILES;
	const [tasks, setTasks] = useState<PublicProjectAgentTask[]>([]);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [loadingOlder, setLoadingOlder] = useState(false);
	const [serverQuery, setServerQuery] = useState("");
	const [error, setError] = useState("");
	const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
	const [savingFileKey, setSavingFileKey] = useState<string | null>(null);
	const [saveError, setSaveError] = useState("");
	const deliverables: Deliverable[] = tasks.flatMap((task): Deliverable[] => {
		if (task.files?.length) return task.files.map((file) => ({ task, file, key: `${task.id}/${file.id}` }));
		if (task.resultText) return [{ task, file: null, key: `${task.id}/response` }];
		return [];
	});

	useEffect(() => {
		const timer = window.setTimeout(() => setServerQuery(filter.trim()), 300);
		return () => window.clearTimeout(timer);
	}, [filter]);

	useEffect(() => {
		if (!projectId) return;
		const controller = new AbortController();
		setLoading(true);
		setError("");
		const query = new URLSearchParams({ limit: "10", ...(serverQuery ? { q: serverQuery } : {}) });
		fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks?${query}`, { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) throw new Error("Could not load Agent runs");
				return response.json() as Promise<{ tasks?: PublicProjectAgentTask[]; nextCursor?: string | null }>;
			})
			.then((data) => {
				if (controller.signal.aborted) return;
				setTasks(data.tasks ?? []);
				setNextCursor(data.nextCursor ?? null);
			})
			.catch((cause) => {
				if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load Agent runs");
			})
			.finally(() => { if (!controller.signal.aborted) setLoading(false); });
		return () => controller.abort();
	}, [projectId, serverQuery]);

	async function saveResponse(task: PublicProjectAgentTask) {
		if (!projectId || !task.resultText || savingTaskId) return;
		setSavingTaskId(task.id);
		setSaveError("");
		try {
			await addKnowledgeFile(projectId, createProjectResponseSource(task.resultText, resultSourceName(task.id)));
			await refreshProject(projectId).catch(() => {});
		} catch (cause) {
			setSaveError(cause instanceof Error ? cause.message : "Could not save Agent response");
		} finally {
			setSavingTaskId(null);
		}
	}

	async function saveFile(task: PublicProjectAgentTask, file: NonNullable<PublicProjectAgentTask["files"]>[number]) {
		if (!projectId || savingFileKey) return;
		const fileKey = `${task.id}/${file.id}`;
		setSavingFileKey(fileKey);
		setSaveError("");
		try {
			const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(task.id)}/files/${encodeURIComponent(file.id)}/save`, { method: "POST" });
			const payload = await response.json().catch(() => ({})) as { fileId?: string; error?: string };
			if (!response.ok || !payload.fileId) throw new Error(payload.error || "Could not save generated file");
			const savedAt = new Date().toISOString();
			setTasks((current) => current.map((item) => item.id !== task.id ? item : {
				...item,
				files: item.files?.map((savedFile) => savedFile.id === file.id
					? { ...savedFile, savedToProjectFileId: payload.fileId, savedAt }
					: savedFile),
			}));
			await refreshProject(projectId).catch(() => {});
		} catch (cause) {
			setSaveError(cause instanceof Error ? cause.message : "Could not save generated file");
		} finally {
			setSavingFileKey(null);
		}
	}

	async function loadOlderRuns() {
		if (!projectId || !nextCursor || loadingOlder) return;
		setLoadingOlder(true);
		setError("");
		try {
			const query = new URLSearchParams({ limit: "10", cursor: nextCursor, ...(serverQuery ? { q: serverQuery } : {}) });
			const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks?${query}`);
			const data = await response.json().catch(() => ({})) as { tasks?: PublicProjectAgentTask[]; nextCursor?: string | null; error?: string };
			if (!response.ok) throw new Error(data.error || "Could not load older Agent runs");
			setTasks((current) => {
				const known = new Set(current.map((task) => task.id));
				return [...current, ...(data.tasks ?? []).filter((task) => !known.has(task.id))];
			});
			setNextCursor(data.nextCursor ?? null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not load older Agent runs");
		} finally {
			setLoadingOlder(false);
		}
	}

	if (!projectId) return null;
	return <section aria-label="Agent runs and deliverables" className="space-y-3">
		<div className="px-1 pt-2">
			<h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">Individual runs and deliverables</h3>
			<p className="mt-1 text-xs text-slate-500">Review results and save completed files to Project sources. Continue conversations from the chat list above.</p>
		</div>
		{error && <p role="alert" className="px-1 py-2 text-xs text-red-600">{error}</p>}
		{saveError && <p role="alert" className="px-1 py-2 text-xs text-red-600">{saveError}</p>}
		{loading && tasks.length === 0 ? <div className="flex justify-center py-5"><Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Loading Agent runs" /></div> : null}
		{!loading && !error && deliverables.length === 0 && <p className="px-1 py-2 text-xs text-slate-500">No Agent outputs match this search.</p>}
		<div className="space-y-2">
			{deliverables.map(({ task, file, key }) => {
				const savedResponse = knowledgeFiles.some((file) => file.name === resultSourceName(task.id));
				const fileKey = file ? `${task.id}/${file.id}` : "";
				const fileUrl = file?.savedToProjectFileId
					? `/api/projects/${encodeURIComponent(projectId)}/knowledge/original?fileId=${encodeURIComponent(file.savedToProjectFileId)}`
					: file ? `/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(task.id)}/files/${encodeURIComponent(file.id)}` : "";
				return <details key={key} className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
					<summary className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
						<span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-100">{file?.name ?? "Agent response"}</span>
						<span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${task.status === "failed" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : task.status === "done" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300"}`}>{file ? statusLabel(task) : task.status === "done" ? "Response" : statusLabel(task)}</span>
						<time className="hidden shrink-0 text-xs text-slate-400 sm:inline" dateTime={task.createdAt}>{new Date(task.createdAt).toLocaleDateString()}</time>
					</summary>
					<div className="space-y-3 border-t border-slate-100 px-3 py-3 dark:border-slate-800">
						{task.error && <details className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
							<summary className="cursor-pointer font-medium">{task.error.startsWith("Office visual review failed:") ? "Visual review failed · draft retained" : "Agent run failed · show details"}</summary>
							<pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all border-t border-amber-200/70 pt-2 dark:border-amber-900/60">{task.error.replace(/^Office visual review failed:\s*/i, "")}</pre>
						</details>}
						{!file && task.resultText && <>
							<div className="prose prose-sm max-w-none break-words dark:prose-invert"><ReactMarkdown remarkPlugins={[remarkGfm]} components={createProjectAgentMarkdownComponents(task.sources)}>{normalizeProjectAgentMarkdown(task.resultText)}</ReactMarkdown></div>
							{!savedResponse && task.status === "done" && <button type="button" disabled={savingTaskId !== null} onClick={() => void saveResponse(task)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
								{savingTaskId === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bookmark className="h-3.5 w-3.5" />}
								{savingTaskId === task.id ? "Saving response…" : "Save response to Project sources"}
							</button>}
							{!savedResponse && task.status !== "done" && <p className="text-xs text-amber-700 dark:text-amber-300">Unverified response; review it in chat before saving.</p>}
							{savedResponse && <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300"><BookmarkCheck className="h-3.5 w-3.5" />Response saved to Project sources</p>}
						</>}
						{file && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/70">
							<a href={fileUrl} className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-orange-700 hover:underline dark:text-orange-300"><Download className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{file.name}</span></a>
							{file.savedToProjectFileId ? <span className="text-emerald-700 dark:text-emerald-300">Saved to Project</span> : task.status === "done" ? <button type="button" disabled={savingFileKey !== null} onClick={() => void saveFile(task, file)} className="rounded-md px-2 py-1 text-slate-600 hover:bg-white disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-700">{savingFileKey === fileKey ? "Saving…" : "Save to Project"}</button> : <span className="text-amber-700 dark:text-amber-300">Unverified draft</span>}
							<ProjectAgentFilePreview projectId={projectId} taskId={task.id} file={file} conversationId={task.conversationId} />
						</div>}
					</div>
				</details>;
			})}
		</div>
		{nextCursor && <button type="button" disabled={loadingOlder} onClick={() => void loadOlderRuns()} className="w-full rounded-lg px-3 py-2 text-xs text-orange-700 hover:bg-orange-50 disabled:opacity-60 dark:text-orange-300 dark:hover:bg-orange-950/30">{loadingOlder ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Load older runs"}</button>}
	</section>;
}
