"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, FileText, Loader2, Plus, Trash2, Users } from "lucide-react";
import { useProjectStore, type KnowledgeFile } from "@/stores/useProjectStore";
import { ProjectPanelSection } from "./ProjectPanelSection";
import { ProjectSourceImportControls } from "./ProjectSourceImportControls";
import { ProjectKnowledgeFilePreview } from "./ProjectKnowledgeFilePreview";

const ACCEPTED_EXTENSIONS = ".txt,.md,.csv,.tsv,.json,.jsonl,.xml,.yaml,.yml,.log,.html,.htm,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.png,.jpg,.jpeg,.gif,.webp,.dxf,.ifc";

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileThumbnail({ file, projectId }: { file: KnowledgeFile; projectId: string }) {
	if (file.fileType !== "image") return <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
	return <img src={`/api/projects/${encodeURIComponent(projectId)}/knowledge/image?fileId=${file.id}`} alt={file.name} className="w-8 h-8 rounded object-cover shrink-0 border border-gray-100 dark:border-gray-700" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />;
}

function StatusLabel({ status }: { status: KnowledgeFile["status"] }) {
	if (status === "ready") return <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Ready</span>;
	if (status === "uploading" || status === "processing") return <Loader2 className="w-3 h-3 animate-spin text-slate-400" />;
	return <AlertCircle className="w-3 h-3 text-red-400" />;
}

export function ProjectFilesSection({ projectId, files, canEdit }: { projectId: string; files: KnowledgeFile[]; canEdit: boolean }) {
	const addFile = useProjectStore((state) => state.addKnowledgeFile);
	const addOneDrive = useProjectStore((state) => state.addKnowledgeFromOneDrive);
	const addYoutube = useProjectStore((state) => state.addKnowledgeFromYoutube);
	const removeFile = useProjectStore((state) => state.removeKnowledgeFile);
	const isSyncing = useProjectStore((state) => state.isSyncing);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [removingId, setRemovingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [oneDriveConnected, setOneDriveConnected] = useState<boolean | null>(null);
	const [oneDriveCanBrowse, setOneDriveCanBrowse] = useState(false);
	const [oneDriveConnecting, setOneDriveConnecting] = useState(false);
	const [oneDriveUrl, setOneDriveUrl] = useState("");
	const [youtubeUrl, setYoutubeUrl] = useState("");
	const [addingOneDrive, setAddingOneDrive] = useState(false);
	const [addingYoutube, setAddingYoutube] = useState(false);
	const [preview, setPreview] = useState<KnowledgeFile | null>(null);

	useEffect(() => {
		fetch("/api/onedrive/status").then((response) => response.ok ? response.json() : { connected: false })
			.then((data) => { setOneDriveConnected(Boolean(data.connected)); setOneDriveCanBrowse(Boolean(data.canBrowse)); }).catch(() => setOneDriveConnected(false));
	}, []);

	function openPreview(file: KnowledgeFile) {
		setPreview(file);
	}

	async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
		setError(null);
		for (const file of Array.from(event.target.files ?? [])) {
			try { await addFile(projectId, file); }
			catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed"); }
		}
		event.target.value = "";
	}

	async function importSource(kind: "onedrive" | "youtube") {
		const url = (kind === "onedrive" ? oneDriveUrl : youtubeUrl).trim();
		if (!url) return;
		const setBusy = kind === "onedrive" ? setAddingOneDrive : setAddingYoutube;
		setError(null); setBusy(true);
		try {
			if (kind === "onedrive") { await addOneDrive(projectId, url); setOneDriveUrl(""); }
			else { await addYoutube(projectId, url); setYoutubeUrl(""); }
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import source"); }
		finally { setBusy(false); }
	}

	async function importOneDriveItem(itemId: string) {
		setError(null); setAddingOneDrive(true);
		try { await addOneDrive(projectId, { itemId }); }
		catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import file"); }
		finally { setAddingOneDrive(false); }
	}

	async function handleRemove(fileId: string) {
		setRemovingId(fileId);
		try { await removeFile(projectId, fileId); }
		finally { setRemovingId(null); }
	}

	function toggleOneDrive() {
		setOneDriveConnecting(true);
		if (!oneDriveConnected) { window.location.href = "/api/onedrive/connect"; return; }
		void fetch("/api/onedrive/disconnect", { method: "POST" }).then(() => setOneDriveConnected(false)).finally(() => setOneDriveConnecting(false));
	}

	return <>
		<ProjectPanelSection label="Files" privacyLabel="All project users" privacyIcon={Users} action={canEdit ? <button onClick={() => fileInputRef.current?.click()} disabled={isSyncing} title="Upload file" className="ml-1 p-1 rounded text-gray-400 hover:text-orange-500 disabled:opacity-40"><Plus className="w-3.5 h-3.5" /></button> : undefined}>
			{canEdit && <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_EXTENSIONS} className="sr-only" onChange={(event) => void handleFiles(event)} disabled={isSyncing} />}
			{canEdit && <ProjectSourceImportControls oneDriveConnected={oneDriveConnected} oneDriveCanBrowse={oneDriveCanBrowse} onPickOneDriveItem={(itemId) => void importOneDriveItem(itemId)} oneDriveConnecting={oneDriveConnecting} oneDriveUrl={oneDriveUrl} onOneDriveUrlChange={setOneDriveUrl} onOneDriveConnection={toggleOneDrive} onAddOneDrive={() => void importSource("onedrive")} addingOneDrive={addingOneDrive} youtubeUrl={youtubeUrl} onYoutubeUrlChange={setYoutubeUrl} onAddYoutube={() => void importSource("youtube")} addingYoutube={addingYoutube} busy={isSyncing} error={error} />}
			{files.length === 0 ? canEdit ? <button onClick={() => fileInputRef.current?.click()} className="w-full flex flex-col items-center gap-2 py-8 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 text-gray-400 hover:border-orange-300 hover:text-orange-500"><FileText className="w-5 h-5" /><p className="text-sm leading-5 text-center">Add PDFs, documents, or other text<br />to reference in this project.</p></button> : <p className="py-4 text-center text-sm text-gray-400">No files in this project yet.</p> : <div className="flex flex-col gap-1">
				{files.map((file) => <div key={file.id} className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" onClick={() => file.status === "ready" && openPreview(file)} title={file.status === "ready" ? `Preview ${file.name}` : undefined}>
					<FileThumbnail file={file} projectId={projectId} /><div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{file.name}</p><p className="text-xs text-gray-400">{formatBytes(file.sizeBytes)}</p></div><StatusLabel status={file.status} />
					{canEdit && <button onClick={(event) => { event.stopPropagation(); void handleRemove(file.id); }} disabled={removingId === file.id || isSyncing} aria-label={`Remove ${file.name}`} className="ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 disabled:opacity-40">{removingId === file.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}</button>}
				</div>)}
			</div>}
		</ProjectPanelSection>
		{preview && <ProjectKnowledgeFilePreview projectId={projectId} file={preview} onClose={() => setPreview(null)} />}
	</>;
}
