"use client";

import { FileText, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

/** One attached file in the composer: a thumbnail for images, an icon for everything else. */
export function ProjectAgentAttachmentChip({ file, onRemove, children }: { file: File; onRemove: () => void; children?: ReactNode }) {
	const [preview, setPreview] = useState<string | null>(null);
	useEffect(() => {
		if (!file.type.startsWith("image/")) { setPreview(null); return; }
		const url = URL.createObjectURL(file);
		setPreview(url);
		return () => URL.revokeObjectURL(url);
	}, [file]);
	return <div className="flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 pr-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
		{preview
			// eslint-disable-next-line @next/next/no-img-element -- local blob preview
			? <img src={preview} alt={file.name} className="h-11 w-11 shrink-0 rounded-lg object-cover" />
			: <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-200/70 text-slate-500 dark:bg-slate-700"><FileText className="h-5 w-5" /></span>}
		<span className="min-w-0 max-w-40"><span className="block truncate">{file.name}</span><span className="block text-[11px] text-slate-400">{file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}</span></span>
		{children}
		<button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`} className="rounded-full p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"><X className="h-3.5 w-3.5" /></button>
	</div>;
}
