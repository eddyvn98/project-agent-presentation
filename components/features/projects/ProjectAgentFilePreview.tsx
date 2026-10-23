"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Eye, Loader2 } from "lucide-react";
import { CsvRenderer, TextRenderer } from "@/components/features/chat/file-preview-data-renderers";
import { ImageRenderer } from "@/components/features/chat/file-preview-media-renderers";
import { ProjectAgentDocumentViewer } from "./ProjectAgentDocumentViewer";
import { ProjectAgentXlsxPreview } from "./ProjectAgentXlsxPreview";
import { ProjectAgentViewerToolbar, type ViewerZoom } from "./ProjectAgentViewerToolbar";
import type { ProjectAgentTaskFile } from "@/lib/project-agent/types";
import { isInteractiveHtmlName } from "@/lib/project-agent/interactive-html";
import { clearProjectAgentCanvasSelection, getProjectAgentCanvasSelection, requestProjectAgentFileEdit, setProjectAgentCanvasSelection, setProjectAgentFileContext, subscribeToProjectAgentView } from "@/lib/project-agent/view-session";

interface Props {
	projectId: string;
	taskId: string;
	file: ProjectAgentTaskFile;
	conversationId?: string;
	persistInConversation?: boolean;
	/** Replaces the eye icon with a custom trigger (for example a file card). */
	renderTrigger?: (open: () => void) => ReactNode;
	/** Opens the preview once on mount, used for a deliverable the agent just finished. */
	autoOpen?: boolean;
}

const PREVIEWABLE = new Set(["doc", "docx", "pdf", "png", "jpg", "jpeg", "webp", "gif", "svg", "txt", "md", "json", "jsonl", "csv", "tsv", "xml", "yaml", "yml", "log", "html", "htm", "xls", "xlsx", "ppt", "pptx"]);
const DOCUMENT_VIEWER = new Set(["pptx", "ppt", "docx", "doc", "pdf"]);
const SERVER_RENDERED = new Set(["xls", "xlsx", "ppt", "pptx", "svg"]);
export const CANVAS_LAYOUT_STYLE = "@media (min-width: 768px) { body:has([data-project-agent-canvas='open']) main { margin-right: 42vw; transition: margin-right 200ms ease-in-out; } }";
const withQuery = (url: string, query: string) => `${url}${url.includes("?") ? "&" : "?"}${query}`;

export const isPreviewableFile = (name: string) => { const ext = name.split(".").pop()?.toLowerCase() ?? ""; return PREVIEWABLE.has(ext) || ext === "html" || ext === "htm"; };

export function ProjectAgentFilePreview({ projectId, taskId, file, conversationId, persistInConversation = false, renderTrigger, autoOpen = false }: Props) {
	const [open, setOpen] = useState(false);
	const [renderedPreviewError, setRenderedPreviewError] = useState(false);
	const [renderedPreviewLoading, setRenderedPreviewLoading] = useState(false);
	const [previewZoom, setPreviewZoom] = useState<ViewerZoom>("fit");
	const [expanded, setExpanded] = useState(false);
	const [runScripts, setRunScripts] = useState(false);
	const htmlFrame = useRef<HTMLIFrameElement>(null);
	const [activeFile, setActiveFile] = useState(file);
	const [activeTaskId, setActiveTaskId] = useState(taskId);
	useEffect(() => { setActiveFile(file); setActiveTaskId(taskId); setRunScripts(false); }, [file, taskId]);
	useEffect(() => {
		if (!autoOpen) return;
		setRenderedPreviewLoading(SERVER_RENDERED.has(file.name.split(".").pop()?.toLowerCase() ?? "") && !/\.xlsx?$/i.test(file.name));
		setOpen(true);
		if (persistInConversation && conversationId) setProjectAgentCanvasSelection(projectId, { conversationId, taskId, fileId: file.id });
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [autoOpen]);
	useEffect(() => {
		if (!persistInConversation || !conversationId) { setOpen(false); return; }
		const sync = () => {
			const selected = getProjectAgentCanvasSelection(projectId, conversationId);
			setOpen(selected?.taskId === taskId && selected.fileId === file.id);
		};
		sync();
		return subscribeToProjectAgentView(projectId, sync);
	}, [conversationId, file.id, persistInConversation, projectId, taskId]);
	const ext = activeFile.name.split(".").pop()?.toLowerCase() ?? "";
	const isHtml = ext === "html" || ext === "htm";
	const interactiveHtml = isHtml && (isInteractiveHtmlName(activeFile.name) || runScripts);
	if (!PREVIEWABLE.has(ext) && !isHtml) return null;

	const url = activeFile.savedToProjectFileId
		? `/api/projects/${encodeURIComponent(projectId)}/knowledge/original?fileId=${encodeURIComponent(activeFile.savedToProjectFileId)}`
		: `/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(activeTaskId)}/files/${encodeURIComponent(activeFile.id)}`;
	const useInChat = (context?: { pageNumber?: number }) => setProjectAgentFileContext(projectId, {
		taskId: activeTaskId,
		fileId: activeFile.id,
		fileName: activeFile.name,
		mimeType: activeFile.mimeType,
		...(conversationId ? { conversationId } : {}),
		...(context?.pageNumber ? { pageNumber: context.pageNumber } : {}),
		...(activeFile.savedToProjectFileId ? { savedToProjectFileId: activeFile.savedToProjectFileId } : {}),
	});
	const openPreview = () => {
		setRenderedPreviewError(false);
		setRenderedPreviewLoading(SERVER_RENDERED.has(ext) && !/\.xlsx?$/i.test(activeFile.name));
		setPreviewZoom("fit");
		setExpanded(false);
		setOpen(true);
		if (persistInConversation && conversationId) setProjectAgentCanvasSelection(projectId, { conversationId, taskId: activeTaskId, fileId: activeFile.id });
	};
	const trigger = renderTrigger ? renderTrigger(openPreview) : <button type="button" onClick={openPreview} className="ml-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-orange-600" aria-label={`Preview ${file.name}`} title="Preview"><Eye className="h-3.5 w-3.5" /></button>;
	const closePreview = () => {
		setOpen(false);
		if (persistInConversation && conversationId) clearProjectAgentCanvasSelection(projectId, conversationId, activeTaskId, activeFile.id);
	};
	const discussInChat = (context?: { pageNumber?: number }) => {
		useInChat(context);
		if (window.matchMedia("(max-width: 767px)").matches) closePreview();
	};
	if (DOCUMENT_VIEWER.has(ext)) {
		const base = url;
		const pdfUrl = ext === "pdf" ? url : `${url}${url.includes("?") ? "&" : "?"}pdf=1`;
		const downloads = [{ label: `Original (.${ext})`, href: url, name: activeFile.name }, ...(ext === "pdf" ? [] : [{ label: "PDF", href: pdfUrl, name: activeFile.name.replace(/\.[^.]+$/, ".pdf") }])];
		const editUrl = activeFile.savedToProjectFileId ? undefined : ext === "pptx" ? `${base}/slides` : ext === "docx" || ext === "pdf" ? `${base}/edit` : undefined;
		return <>
			{trigger}
			{open && !expanded && <style>{CANVAS_LAYOUT_STYLE}</style>}
			{open && <div data-project-agent-canvas="open" className={`fixed right-0 top-12 z-[70] flex h-[calc(100dvh-3rem)] w-full flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-gray-950 ${expanded ? "left-0" : "md:w-[42vw] md:max-w-[1100px]"}`} role="dialog" aria-modal="false" aria-label={`Preview ${activeFile.name}`}>
				<ProjectAgentDocumentViewer pdfUrl={pdfUrl} fileName={activeFile.name} kind={ext === "pptx" || ext === "ppt" ? "slides" : "pages"} downloads={downloads} editUrl={editUrl}
					expanded={expanded} onExpand={() => setExpanded((value) => !value)} onClose={() => { setExpanded(false); closePreview(); }}
					onRequestEdit={(pageNumber, region, note) => { requestProjectAgentFileEdit(projectId, { taskId: activeTaskId, fileId: activeFile.id, fileName: activeFile.name, mimeType: activeFile.mimeType, ...(conversationId ? { conversationId } : {}), ...(activeFile.savedToProjectFileId ? { savedToProjectFileId: activeFile.savedToProjectFileId } : {}), pageNumber, region, note }); }}
					onDiscussPage={(pageNumber) => discussInChat({ pageNumber })} />
			</div>}
		</>;
	}
	if (SERVER_RENDERED.has(ext)) {
		return <>
			{trigger}
			{open && !expanded && <style>{CANVAS_LAYOUT_STYLE}</style>}
			{open && <div data-project-agent-canvas="open" className={`fixed right-0 top-12 z-[70] flex h-[calc(100dvh-3rem)] w-full flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-gray-950 ${expanded ? "left-0" : "md:w-[42vw] md:max-w-[1100px]"}`} role="dialog" aria-modal="false" aria-label={`Preview: ${activeFile.name}`}>
				<ProjectAgentViewerToolbar fileName={activeFile.name} zoom={previewZoom} onZoom={setPreviewZoom} downloads={[{ label: `Original (.${ext})`, href: url, name: activeFile.name }]} expanded={expanded} onExpand={() => setExpanded((value) => !value)} onClose={() => { setExpanded(false); closePreview(); }} />
				<div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4 dark:bg-slate-900">
					{renderedPreviewError ? <p role="alert" className="mx-auto max-w-lg py-10 text-center text-sm text-slate-500">Could not render this file. Download it to view in a compatible application.</p> : <>
						{renderedPreviewLoading && <p role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Preparing file preview…</p>}
						{ext === "xlsx" ? <div style={{ zoom: previewZoom === "fit" ? "100%" : `${previewZoom}%` }} className="h-full"><ProjectAgentXlsxPreview url={url} editUrl={`/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(activeTaskId)}/files/${encodeURIComponent(activeFile.id)}/spreadsheet`} /></div> : <>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={`${url}${url.includes("?") ? "&" : "?"}rendered=1`} alt={`Rendered pages of ${activeFile.name}`} onLoad={() => setRenderedPreviewLoading(false)} onError={() => { setRenderedPreviewLoading(false); setRenderedPreviewError(true); }} style={{ width: previewZoom === "fit" ? "100%" : `${previewZoom}%`, maxWidth: "none" }} className={`mx-auto h-auto rounded shadow-sm transition-[width] ${renderedPreviewLoading ? "hidden" : ""}`} />
						</>}
					</>}
				</div>
				<footer className="border-t border-slate-200 px-4 py-3 text-right text-xs text-slate-500 dark:border-slate-800"><button type="button" onClick={() => discussInChat()} className="rounded-lg border border-orange-200 px-3 py-2 font-medium text-orange-700 hover:bg-orange-50 dark:border-orange-900/50 dark:text-orange-300 dark:hover:bg-orange-950/30">Discuss this file in chat</button></footer>
			</div>}
		</>;
	}
	if (isHtml) {
		return <>
			{trigger}
			{open && !expanded && <style>{CANVAS_LAYOUT_STYLE}</style>}
			{open && <div data-project-agent-canvas="open" className={`fixed right-0 top-12 z-[70] flex h-[calc(100dvh-3rem)] w-full flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-gray-950 ${expanded ? "left-0" : "md:w-[42vw] md:max-w-[1100px]"}`} role="dialog" aria-modal="false" aria-label={`Preview: ${activeFile.name}`}>
				<ProjectAgentViewerToolbar fileName={activeFile.name} zoom={previewZoom} onZoom={setPreviewZoom} onPresent={interactiveHtml ? () => void htmlFrame.current?.requestFullscreen?.().catch(() => undefined) : undefined} downloads={[{ label: `Original (.${ext})`, href: url, name: activeFile.name }]} expanded={expanded} onExpand={() => setExpanded((value) => !value)} onClose={() => { setExpanded(false); closePreview(); }} />
				<div className="min-h-0 flex-1 overflow-auto bg-slate-100 dark:bg-slate-900"><iframe ref={htmlFrame} src={withQuery(url, interactiveHtml ? "preview=1&run=1" : "preview=1")} title={`Rendered preview of ${activeFile.name}`} sandbox={interactiveHtml ? "allow-scripts allow-popups allow-presentation allow-modals" : ""} allow="fullscreen" style={{ zoom: previewZoom === "fit" ? "100%" : `${previewZoom}%` }} className="h-full w-full border-0" /></div>
				<footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 text-right text-xs text-slate-500 dark:border-slate-800">{!isInteractiveHtmlName(activeFile.name) && <button type="button" onClick={() => setRunScripts((value) => !value)} className="rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{runScripts ? "Back to static preview" : "Run interactive page"}</button>}<button type="button" onClick={() => discussInChat()} className="rounded-lg border border-orange-200 px-3 py-2 font-medium text-orange-700 hover:bg-orange-50 dark:border-orange-900/50 dark:text-orange-300 dark:hover:bg-orange-950/30">Discuss this file in chat</button></footer>
			</div>}
		</>;
	}
	return <>
		{trigger}
		{open && !expanded && <style>{CANVAS_LAYOUT_STYLE}</style>}
		{open && <div data-project-agent-canvas="open" className={`fixed right-0 top-12 z-[70] flex h-[calc(100dvh-3rem)] w-full flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-gray-950 ${expanded ? "left-0" : "md:w-[42vw] md:max-w-[1100px]"}`} role="dialog" aria-modal="false" aria-label={`Preview: ${activeFile.name}`}>
			<ProjectAgentViewerToolbar fileName={activeFile.name} zoom={previewZoom} onZoom={setPreviewZoom} downloads={[{ label: `Original (.${ext})`, href: url, name: activeFile.name }]} expanded={expanded} onExpand={() => setExpanded((value) => !value)} onClose={() => { setExpanded(false); closePreview(); }} />
			<div className="min-h-0 flex-1 overflow-auto bg-slate-100 dark:bg-slate-900" style={{ zoom: previewZoom === "fit" ? "100%" : `${previewZoom}%` }}>
				{ext === "csv" ? <CsvRenderer fileUrl={url} fileName={activeFile.name} /> : ["txt", "md", "json", "jsonl", "tsv", "xml", "yaml", "yml", "log"].includes(ext) ? <TextRenderer fileUrl={url} fileName={activeFile.name} ext={ext} /> : ["png", "jpg", "jpeg", "webp", "gif"].includes(ext) ? <ImageRenderer fileUrl={url} fileName={activeFile.name} /> : <img src={withQuery(url, "preview=1")} alt={activeFile.name} className="mx-auto max-h-full max-w-full object-contain" />}
			</div>
			<footer className="border-t border-slate-200 px-4 py-3 text-right text-xs text-slate-500 dark:border-slate-800"><button type="button" onClick={() => discussInChat()} className="rounded-lg border border-orange-200 px-3 py-2 font-medium text-orange-700 hover:bg-orange-50 dark:border-orange-900/50 dark:text-orange-300 dark:hover:bg-orange-950/30">Discuss this file in chat</button></footer>
		</div>}
	</>;
}
