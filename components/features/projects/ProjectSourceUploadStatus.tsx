import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";

export interface SourceUpload { id: string; name: string; state: "uploading" | "done" | "error"; progress: number; message?: string }

/** One row per file being added to the Project sources: progress while it goes up, then added or the reason it failed. */
export function ProjectSourceUploadStatus({ uploads, onDismiss }: { uploads: SourceUpload[]; onDismiss: (id: string) => void }) {
	if (!uploads.length) return null;
	return <ul className="mt-2 space-y-1.5 px-3" aria-live="polite">
		{uploads.map((upload) => {
			const percent = Math.round(upload.progress * 100);
			return <li key={upload.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
				<div className="flex items-center gap-2">
					{upload.state === "uploading" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500" /> : upload.state === "done" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />}
					<span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-100" title={upload.name}>{upload.name}</span>
					<span className={`shrink-0 text-xs ${upload.state === "error" ? "text-red-600" : "text-slate-500"}`}>{upload.state === "uploading" ? (percent >= 100 ? "Processing…" : `Uploading ${percent}%`) : upload.state === "done" ? "Added" : "Failed"}</span>
					{upload.state !== "uploading" && <button type="button" onClick={() => onDismiss(upload.id)} aria-label={`Dismiss ${upload.name}`} className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-3.5 w-3.5" /></button>}
				</div>
				{upload.state === "uploading" && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`Uploading ${upload.name}`}><div className="h-full rounded-full bg-orange-500 transition-[width] duration-200" style={{ width: `${percent}%` }} /></div>}
				{upload.state === "error" && upload.message && <p className="mt-1 text-xs text-red-600">{upload.message}</p>}
			</li>;
		})}
	</ul>;
}
