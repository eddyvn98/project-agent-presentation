import { FileText } from "lucide-react";
import { ProjectAgentZoomImage } from "./ProjectAgentZoomImage";

type Attachment = { id: string; name: string; mimeType: string; size: number };

/** Files the user attached to a sent message: image thumbnails (enlarge in a dialog) and file chips. */
export function ProjectAgentSentAttachments({ projectId, taskId, files }: { projectId: string; taskId: string; files?: Attachment[] }) {
	if (!files?.length) return null;
	const href = (file: Attachment) => `/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(file.id)}`;
	return <div className="mb-2 flex flex-wrap justify-end gap-2">
		{files.map((file) => file.mimeType.startsWith("image/")
			? <ProjectAgentZoomImage key={file.id} src={href(file)} alt={file.name} title={file.name} label={`Enlarge ${file.name}`} className="block size-[72px] shrink-0 overflow-hidden rounded-xl border border-slate-200 sm:size-[80px] dark:border-slate-700">
				{/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin file */}
				<img src={href(file)} alt={file.name} loading="lazy" className="h-full w-full object-cover" />
			</ProjectAgentZoomImage>
			: <a key={file.id} href={href(file)} download={file.name} title={file.name} className="flex max-w-[220px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><FileText className="h-4 w-4 shrink-0 text-slate-400" /><span className="truncate">{file.name}</span></a>)}
	</div>;
}
