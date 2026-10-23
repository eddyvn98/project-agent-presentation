"use client";

import { useState } from "react";
import { Download, ExternalLink, Loader2, Pencil, X } from "lucide-react";
import type { ProjectAgentTaskFile } from "@/lib/project-agent/types";
import { CANVAS_LAYOUT_STYLE } from "./ProjectAgentFilePreview";
import { PanelModeTabs, PdfViewFrame, type PanelMode } from "./ProjectAgentPdfView";

interface Opened { boardId: string; docId: string; editorUrl: string; notes: string[] }

/** "Edit" on a Word deliverable: imports it into a Workspace document and opens the editor in the side panel. */
export function ProjectAgentWordEdit({ projectId, taskId, file }: { projectId: string; taskId: string; file: ProjectAgentTaskFile }) {
	const [state, setState] = useState<"idle" | "loading" | "error">("idle");
	const [error, setError] = useState("");
	const [opened, setOpened] = useState<Opened | null>(null);
	const [mode, setMode] = useState<PanelMode>("edit");
	const start = async () => {
		setState("loading");
		try {
			const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(taskId)}/files/${encodeURIComponent(file.id)}/edit`, { method: "POST" });
			const body = await response.json().catch(() => ({})) as Partial<Opened> & { error?: string };
			if (!response.ok || !body.boardId || !body.docId || !body.editorUrl) throw new Error(body.error || "Could not open the file for editing");
			setMode("edit");
			setOpened({ boardId: body.boardId, docId: body.docId, editorUrl: body.editorUrl, notes: body.notes ?? [] });
			setState("idle");
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open the file for editing"); setState("error"); }
	};
	const exportUrl = opened ? `/api/workspaces/${encodeURIComponent(opened.boardId)}/export?format=docx&blockIds=${encodeURIComponent(JSON.stringify([opened.docId]))}` : "";
	return <>
		<button type="button" onClick={() => void start()} disabled={state === "loading"} title={state === "error" ? error : "Edit on the web"} aria-label={`Edit ${file.name} on the web`} className={`flex items-center gap-1 px-2 text-xs font-medium ${state === "error" ? "text-red-600" : "text-slate-500 hover:text-orange-600"}`}>
			{state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}{state === "error" ? "Retry" : "Edit"}
		</button>
		{opened && <><style>{CANVAS_LAYOUT_STYLE}</style>
			<div data-project-agent-canvas="open" className="fixed right-0 top-12 z-[75] flex h-[calc(100dvh-3rem)] w-full flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-gray-950 md:w-[42vw] md:max-w-[1100px]" role="dialog" aria-label={`Editing ${file.name}`}>
				<header className="flex h-12 shrink-0 items-center gap-3 border-b px-4 dark:border-gray-800">
					<strong className="min-w-0 flex-1 truncate text-sm">{file.name}</strong>
					<PanelModeTabs mode={mode} onChange={setMode} />
					<a href={opened.editorUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-orange-600 hover:underline"><ExternalLink className="h-3.5 w-3.5" />Expand in a new tab</a>
					<a href={exportUrl} className="inline-flex items-center gap-1 text-xs text-orange-600 hover:underline"><Download className="h-3.5 w-3.5" />Download as Word</a>
					<button type="button" onClick={() => setOpened(null)} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
				</header>
				{opened.notes.length > 0 && <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">{opened.notes.join(" ")} Download as Word exports this edited copy, not the original file.</p>}
				<iframe src={`${opened.editorUrl}&embed=1`} title={`Editing ${file.name}`} className={`min-h-0 flex-1 border-0 ${mode === "edit" ? "" : "hidden"}`} />
				{mode === "pdf" && <PdfViewFrame boardId={opened.boardId} blockId={opened.docId} name={file.name} />}
			</div></>}
	</>;
}
