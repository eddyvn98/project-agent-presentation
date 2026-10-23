"use client";

import type { ReactNode } from "react";
import { Download, File, FileSpreadsheet, FileText, Globe, Presentation } from "lucide-react";
import type { ProjectAgentTaskFile } from "@/lib/project-agent/types";

const KINDS: Record<string, { label: string; tone: string; Icon: typeof File }> = {
	docx: { label: "Word document", tone: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300", Icon: FileText },
	doc: { label: "Word document", tone: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300", Icon: FileText },
	xlsx: { label: "Excel spreadsheet", tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300", Icon: FileSpreadsheet },
	xls: { label: "Excel spreadsheet", tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300", Icon: FileSpreadsheet },
	csv: { label: "CSV table", tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300", Icon: FileSpreadsheet },
	pptx: { label: "PowerPoint deck", tone: "bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-300", Icon: Presentation },
	ppt: { label: "PowerPoint deck", tone: "bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-300", Icon: Presentation },
	pdf: { label: "PDF document", tone: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300", Icon: FileText },
	html: { label: "Web page", tone: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300", Icon: Globe },
	htm: { label: "Web page", tone: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300", Icon: Globe },
	md: { label: "Markdown", tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", Icon: FileText },
	txt: { label: "Text file", tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", Icon: FileText },
	zip: { label: "ZIP archive", tone: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300", Icon: File },
};
const FALLBACK = { label: "File", tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", Icon: File };

export const fileExtension = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface Props { file: ProjectAgentTaskFile; href: string; onOpen?: () => void; extra?: ReactNode }

/** One deliverable as a card: type icon, name, kind and size; the card opens the preview, the arrow downloads. */
export function ProjectAgentFileCard({ file, href, onOpen, extra }: Props) {
	const kind = KINDS[fileExtension(file.name)] ?? FALLBACK;
	const body = <>
		<span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${kind.tone}`}><kind.Icon className="h-5 w-5" /></span>
		<span className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{file.name}</span><span className="block text-xs text-slate-500 dark:text-slate-400">{kind.label} · {formatSize(file.size)}</span></span>
	</>;
	const frame = "flex min-w-0 flex-1 items-center gap-3 p-3 text-left";
	return <div className="group flex w-full min-w-0 items-stretch rounded-xl border border-slate-200 bg-white transition-colors hover:border-orange-300 hover:bg-orange-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-orange-500/50 dark:hover:bg-slate-800 sm:w-[calc(50%-0.25rem)]">
		{onOpen ? <button type="button" onClick={onOpen} className={frame} title="Open preview">{body}</button> : <a href={href} className={frame} download={file.name}>{body}</a>}
		{extra}
		<a href={href} download={file.name} aria-label={`Download ${file.name}`} title="Download" className="flex items-center px-3 text-slate-400 hover:text-orange-600"><Download className="h-4 w-4" /></a>
	</div>;
}
