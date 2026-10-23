import { FileText, Loader2 } from "lucide-react";
import { ProjectAgentUserText } from "./ProjectAgentUserText";

export interface OutgoingFile { name: string; size: number; mimeType: string; state: "saving" | "uploading"; progress: number }
export interface OutgoingMessage { prompt: string; files: OutgoingFile[] }

const sizeLabel = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** The message the user just sent, shown while its files are still going up (the saved task replaces it). */
export function ProjectAgentOutgoingMessage({ message }: { message: OutgoingMessage }) {
	return <article className="mx-auto w-full max-w-3xl space-y-3 pb-5" aria-live="polite">
		<div className="ml-auto max-w-[90%] rounded-[24px] rounded-br-md bg-slate-100 px-5 py-3.5 text-[15px] leading-7 text-slate-800 dark:bg-slate-800 dark:text-slate-100 sm:max-w-[82%]">
			{message.files.length > 0 && <div className="mb-2 flex flex-col items-end gap-2">
				{message.files.map((file, index) => {
					const percent = Math.round(file.progress * 100);
					return <div key={`${file.name}-${index}`} className="w-full max-w-[260px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
						<div className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span><span className="shrink-0 text-[11px] text-slate-400">{sizeLabel(file.size)}</span></div>
						<div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`Uploading ${file.name}`}><div className="h-full rounded-full bg-orange-500 transition-[width] duration-200" style={{ width: `${percent}%` }} /></div>
						<p className="mt-1 text-[11px] text-slate-400">{percent >= 100 ? "Processing…" : file.state === "saving" ? `Adding to project… ${percent}%` : `Uploading… ${percent}%`}</p>
					</div>;
				})}
			</div>}
			<ProjectAgentUserText text={message.prompt} />
		</div>
		<p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{message.files.length ? "Uploading your files before the agent starts…" : "Sending…"}</p>
	</article>;
}
