"use client";

import { useState } from "react";
import { Download, X } from "lucide-react";
import FilePreviewPanel from "@/components/features/chat/file-preview-panel";
import type { KnowledgeFile } from "@/stores/useProjectStore";

const SERVER_RENDERED = new Set(["xls", "xlsx", "ppt", "pptx", "svg"]);

export function ProjectKnowledgeFilePreview({ projectId, file, onClose }: {
	projectId: string;
	file: KnowledgeFile;
	onClose: () => void;
}) {
	const [renderError, setRenderError] = useState(false);
	const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
	const base = `/api/projects/${encodeURIComponent(projectId)}/knowledge/original?fileId=${encodeURIComponent(file.id)}`;
	const url = `${base}&preview=1`;
	if (SERVER_RENDERED.has(ext)) {
		return <div className="fixed inset-0 z-[70] flex flex-col bg-white dark:bg-gray-950" role="dialog" aria-modal="true" aria-label={`Preview: ${file.name}`}>
			<header className="flex h-12 shrink-0 items-center gap-3 border-b px-4 dark:border-gray-800">
				<strong className="min-w-0 flex-1 truncate text-sm">{file.name}</strong>
				<a href={base} download={file.name} className="inline-flex items-center gap-1 text-xs text-orange-600 hover:underline"><Download className="h-3.5 w-3.5" />Download</a>
				<button type="button" onClick={onClose} aria-label="Close preview" className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
			</header>
			<div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4 dark:bg-slate-900">
				{renderError ? <p role="alert" className="mx-auto max-w-lg py-10 text-center text-sm text-slate-500">Could not render this file. Download it to view in a compatible application.</p> : <img src={`${base}&rendered=1`} alt={`Rendered pages of ${file.name}`} onError={() => setRenderError(true)} className="mx-auto h-auto max-w-full rounded shadow-sm" />}
			</div>
		</div>;
	}
	if (ext === "html" || ext === "htm") {
		return <div className="fixed inset-0 z-[70] flex flex-col bg-white dark:bg-gray-950" role="dialog" aria-modal="true" aria-label={`Preview: ${file.name}`}>
			<header className="flex h-12 shrink-0 items-center gap-3 border-b px-4 dark:border-gray-800">
				<strong className="min-w-0 flex-1 truncate text-sm">{file.name}</strong>
				<a href={base} download={file.name} className="inline-flex items-center gap-1 text-xs text-orange-600 hover:underline"><Download className="h-3.5 w-3.5" />Download</a>
				<button type="button" onClick={onClose} aria-label="Close preview" className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
			</header>
			<iframe src={url} title={`Rendered preview of ${file.name}`} sandbox="" className="min-h-0 flex-1 border-0" />
		</div>;
	}
	const wordAsPdf = ext === "docx" || ext === "doc";
	const previewExt = wordAsPdf ? "pdf" : ext === "markdown" ? "md" : ext === "tsv" ? "csv" : ext;
	return <FilePreviewPanel fileName={file.name} fileUrl={wordAsPdf ? `${base}&pdf=1` : url} ext={previewExt} onClose={onClose} />;
}
