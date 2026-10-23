"use client";

import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";
import { ProjectAgentFilePreview } from "./ProjectAgentFilePreview";

/** "View files in chat": every file the agent made in this chat, newest first. */
export function ProjectAgentFilesPanel({ open, onClose, projectId, tasks, conversationId, fileUrl }: { open: boolean; onClose: () => void; projectId: string; tasks: PublicProjectAgentTask[]; conversationId?: string; fileUrl: (task: PublicProjectAgentTask, file: NonNullable<PublicProjectAgentTask["files"]>[number]) => string }) {
	if (!open) return null;
	const rows = [...tasks].reverse().flatMap((task) => (task.files ?? []).map((file) => ({ task, file })));
	return createPortal(<div role="dialog" aria-modal="true" aria-label="Files in this chat" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
		<div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
			<div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700"><p className="text-sm font-semibold">Files in this chat</p><button type="button" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button></div>
			<ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
				{rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No files yet.</li>}
				{rows.map(({ task, file }) => <li key={`${task.id}-${file.id}`} className="flex items-center gap-2 px-4 py-2.5 text-sm"><span className="min-w-0 flex-1 truncate">{file.name}</span><ProjectAgentFilePreview projectId={projectId} taskId={task.id} file={file} conversationId={conversationId} persistInConversation /><a href={fileUrl(task, file)} download={file.name} aria-label={`Download ${file.name}`} title="Download" className="text-slate-500 hover:text-orange-600"><Download className="h-4 w-4" /></a></li>)}
			</ul>
		</div>
	</div>, document.body);
}
