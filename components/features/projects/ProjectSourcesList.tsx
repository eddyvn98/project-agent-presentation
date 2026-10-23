"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, BookOpen, FileText, Globe, HardDrive, Image as ImageIcon, Loader2, Plus, Trash2, Upload, Youtube } from "lucide-react";
import { useProjectStore, type KnowledgeFile } from "@/stores/useProjectStore";
import { AUDIO_EXPIRY_WARNING_DAYS as EXTEND_WINDOW_DAYS } from "@/lib/meeting/audioRetention";
import { ProjectAgentSourceEditor } from "./ProjectAgentSourceEditor";
import { ProjectSourceUploadStatus, type SourceUpload } from "./ProjectSourceUploadStatus";
import { ProjectKnowledgeFilePreview } from "./ProjectKnowledgeFilePreview";

const ACCEPTED_EXTENSIONS = ".txt,.md,.csv,.tsv,.json,.jsonl,.xml,.yaml,.yml,.log,.html,.htm,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.png,.jpg,.jpeg,.gif,.webp,.dxf,.ifc";
type LinkKind = "onedrive" | "youtube";

const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const DAY_MS = 24 * 60 * 60 * 1000;
const daysLeft = (expiresAt: number) => Math.ceil((expiresAt - Date.now()) / DAY_MS);
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
const sourceKind = (file: KnowledgeFile) => file.managed === "runbook" ? "Runbook · rules the agent follows" : file.managed === "worklog" ? "Work log · what the agent did" : file.sourceUrl ? `Saved by agent · ${hostOf(file.sourceUrl)}` : file.fileType === "image" ? "Image" : "File";
const formatDate = (ms: number) => new Date(ms).toLocaleDateString("en", { month: "short", day: "numeric", ...(new Date(ms).getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
const selectClass = "cursor-pointer rounded-lg bg-transparent px-2 py-1.5 text-sm text-slate-600 outline-none hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800";

export function ProjectSourcesList({ projectId, files, canEdit }: { projectId: string; files: KnowledgeFile[]; canEdit: boolean }) {
	const addFile = useProjectStore((state) => state.addKnowledgeFile);
	const addOneDrive = useProjectStore((state) => state.addKnowledgeFromOneDrive);
	const addYoutube = useProjectStore((state) => state.addKnowledgeFromYoutube);
	const removeFile = useProjectStore((state) => state.removeKnowledgeFile);
	const isSyncing = useProjectStore((state) => state.isSyncing);
	const refreshProject = useProjectStore((state) => state.refreshProject);
	const [extendingId, setExtendingId] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const [menuOpen, setMenuOpen] = useState(false);
	const [linkKind, setLinkKind] = useState<LinkKind | null>(null);
	const [linkUrl, setLinkUrl] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [uploads, setUploads] = useState<SourceUpload[]>([]);
	const [removingId, setRemovingId] = useState<string | null>(null);
	const [preview, setPreview] = useState<KnowledgeFile | null>(null);
	const [sort, setSort] = useState<"newest" | "oldest" | "name">("newest");
	const [filter, setFilter] = useState<"all" | "documents" | "images" | "agent">("all");

	useEffect(() => {
		if (!menuOpen) return;
		const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
		document.addEventListener("mousedown", close);
		return () => document.removeEventListener("mousedown", close);
	}, [menuOpen]);

	const patchUpload = (id: string, change: Partial<SourceUpload>) => setUploads((current) => current.map((item) => item.id === id ? { ...item, ...change } : item));
	const dismissUpload = (id: string) => setUploads((current) => current.filter((item) => item.id !== id));
	async function upload(event: ChangeEvent<HTMLInputElement>) {
		setError(null);
		const picked = Array.from(event.target.files ?? []);
		event.target.value = "";
		const entries = picked.map((file) => ({ file, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }));
		setUploads((current) => [...current, ...entries.map(({ file, id }) => ({ id, name: file.name, state: "uploading" as const, progress: 0 }))]);
		for (const { file, id } of entries) {
			try {
				await addFile(projectId, file, (fraction) => patchUpload(id, { progress: fraction }));
				patchUpload(id, { state: "done", progress: 1 });
				window.setTimeout(() => dismissUpload(id), 5_000);
			} catch (cause) { patchUpload(id, { state: "error", message: cause instanceof Error ? cause.message : "Upload failed" }); }
		}
	}
	async function importLink() {
		const url = linkUrl.trim();
		if (!url || !linkKind) return;
		setError(null); setBusy(true);
		try {
			if (linkKind === "onedrive") await addOneDrive(projectId, url); else await addYoutube(projectId, url);
			setLinkUrl(""); setLinkKind(null);
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import source"); }
		finally { setBusy(false); }
	}
	async function extend(fileId: string) {
		setExtendingId(fileId); setError(null);
		try {
			const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/knowledge/retention`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId }) });
			const result = await response.json().catch(() => ({})) as { error?: string };
			if (!response.ok) throw new Error(result.error ?? "Could not extend storage");
			await refreshProject(projectId);
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not extend storage"); }
		finally { setExtendingId(null); }
	}
	async function remove(fileId: string) {
		setRemovingId(fileId);
		try { await removeFile(projectId, fileId); } finally { setRemovingId(null); }
	}

	const shown = files
		.filter((file) => filter === "all" || (filter === "agent" ? file.origin === "agent" : filter === "images" ? file.fileType === "image" : file.fileType !== "image"))
		.sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "oldest" ? a.uploadedAt - b.uploadedAt : b.uploadedAt - a.uploadedAt);
	const entry = "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800";
	return (
		<section aria-label="Project sources">
			<div className="mb-2 flex items-center justify-end gap-1">
				<select aria-label="Sort sources" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className={selectClass}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name</option></select>
				<select aria-label="Filter sources" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className={selectClass}><option value="all">All</option><option value="documents">Documents</option><option value="images">Images</option><option value="agent">Added by agent</option></select>
			</div>
			{canEdit ? (
				<div ref={menuRef} className="relative border-b border-slate-200 pb-2 dark:border-slate-800">
					<input ref={inputRef} type="file" multiple accept={ACCEPTED_EXTENSIONS} className="sr-only" onChange={(event) => void upload(event)} disabled={isSyncing} />
					<button type="button" onClick={() => setMenuOpen(!menuOpen)} aria-haspopup="menu" aria-expanded={menuOpen} className="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left text-[15px] text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/60"><Plus className="h-5 w-5" />Add sources</button>
					{menuOpen ? (
						<div role="menu" className="absolute left-2 top-full z-30 mt-1 w-72 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
							<button type="button" role="menuitem" className={entry} onClick={() => { setMenuOpen(false); inputRef.current?.click(); }}><Upload className="h-4 w-4" />Upload files</button>
							<button type="button" role="menuitem" className={entry} onClick={() => { setMenuOpen(false); setLinkKind("onedrive"); }}><HardDrive className="h-4 w-4" />OneDrive or SharePoint link</button>
							<button type="button" role="menuitem" className={entry} onClick={() => { setMenuOpen(false); setLinkKind("youtube"); }}><Youtube className="h-4 w-4" />YouTube link</button>
						</div>
					) : null}
					{linkKind ? (
						<div className="mt-2 flex items-center gap-2 px-3">
							<input autoFocus value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void importLink(); if (event.key === "Escape") setLinkKind(null); }} placeholder={linkKind === "onedrive" ? "Paste a OneDrive or SharePoint link" : "Paste a YouTube link"} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-slate-500 dark:border-slate-600" />
							<button type="button" disabled={!linkUrl.trim() || busy} onClick={() => void importLink()} className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Add</button>
							<button type="button" onClick={() => setLinkKind(null)} className="text-sm text-slate-500 hover:underline">Cancel</button>
						</div>
					) : null}
				</div>
			) : null}
			<ProjectSourceUploadStatus uploads={uploads} onDismiss={dismissUpload} />
			{error ? <p role="alert" className="mt-2 flex items-center gap-1.5 px-3 text-sm text-red-600"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p> : null}
			{shown.length === 0 ? <p className="px-3 py-10 text-center text-sm text-slate-500">{files.length === 0 ? "No sources yet. Add files so every chat in this project can use them." : "No sources match this filter."}</p> : (
				<ul>
					{shown.map((file) => (
						<li key={file.id} className="group flex items-center gap-4 rounded-xl px-3 py-3 hover:bg-slate-100 dark:hover:bg-slate-800/60">
							<button type="button" disabled={file.status !== "ready"} onClick={() => setPreview(file)} className="flex min-w-0 flex-1 items-center gap-4 text-left disabled:cursor-default">
								<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900">{file.fileType === "image" ? <ImageIcon className="h-5 w-5" /> : file.managed ? <BookOpen className="h-5 w-5" /> : file.sourceUrl ? <Globe className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</span>
								<span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-medium text-slate-900 dark:text-slate-100">{file.name}</span><span className="block text-sm text-slate-500">{sourceKind(file)} · {formatBytes(file.sizeBytes)}{file.status !== "ready" && file.status !== "error" ? " · Processing" : ""}{file.status === "error" ? " · Failed" : ""}</span>{file.isLargeSource && file.retentionExpiresAt ? (() => { const left = daysLeft(file.retentionExpiresAt); const soon = left <= EXTEND_WINDOW_DAYS; return <span className={`block text-xs ${soon ? "font-medium text-amber-600" : "text-slate-400"}`}>{left <= 0 ? "Source was auto-deleted — upload it again" : `Auto-deletes in ${left} day${left === 1 ? "" : "s"} (${new Date(file.retentionExpiresAt).toLocaleDateString()})`}</span>; })() : null}</span>
							</button>
							{file.sourceUrl ? <a href={file.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${file.name} page`} className="shrink-0 rounded-md p-1.5 text-slate-400 opacity-0 hover:bg-slate-200/70 hover:text-slate-700 focus-visible:opacity-100 group-hover:opacity-100"><Globe className="h-4 w-4" /></a> : null}
			{canEdit && file.isLargeSource && file.retentionExpiresAt && daysLeft(file.retentionExpiresAt) > 0 && daysLeft(file.retentionExpiresAt) <= EXTEND_WINDOW_DAYS ? <button type="button" onClick={() => void extend(file.id)} disabled={extendingId === file.id} className="shrink-0 rounded-full border border-amber-300 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50">{extendingId === file.id ? "Extending…" : "Extend 30 days"}</button> : null}
			{canEdit ? <button type="button" onClick={() => void remove(file.id)} disabled={removingId === file.id || isSyncing} aria-label={`Remove ${file.name}`} className="rounded-md p-1.5 text-slate-400 opacity-0 hover:bg-slate-200/70 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40">{removingId === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button> : null}
							<span className="w-16 shrink-0 text-right text-sm text-slate-500">{formatDate(file.uploadedAt)}</span>
						</li>
					))}
				</ul>
			)}
			{preview ? (preview.origin || preview.managed ? <ProjectAgentSourceEditor projectId={projectId} file={preview} canEdit={canEdit} onClose={() => setPreview(null)} /> : <ProjectKnowledgeFilePreview projectId={projectId} file={preview} onClose={() => setPreview(null)} />) : null}
		</section>
	);
}
