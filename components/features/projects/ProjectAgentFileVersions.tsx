"use client";

import { useState } from "react";
import { History } from "lucide-react";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";
import type { FileVersion } from "@/lib/project-agent/file-versions";

interface Props {
	projectId: string;
	versions: Array<FileVersion<PublicProjectAgentTask>>;
	currentTaskId: string;
	fileHref: (task: PublicProjectAgentTask, file: FileVersion<PublicProjectAgentTask>["file"]) => string;
}

/** Earlier versions of a deliverable in this chat: download any of them, or put one back so the next message continues from it. */
export function ProjectAgentFileVersions({ projectId, versions, currentTaskId, fileHref }: Props) {
	const [open, setOpen] = useState(false);
	const [notice, setNotice] = useState("");
	if (versions.length < 2) return null;
	const position = versions.findIndex((version) => version.task.id === currentTaskId) + 1;
	async function restore(version: Props["versions"][number]) {
		setNotice("");
		try {
			const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(version.task.id)}/files/${encodeURIComponent(version.file.id)}/restore`, { method: "POST" });
			if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Could not restore this version");
			setNotice(`Version ${version.number} is back in the workspace. Your next message continues from it.`);
		} catch (cause) { setNotice(cause instanceof Error ? cause.message : "Could not restore this version"); }
	}
	return <div className="relative mt-1 text-xs text-slate-500">
		<button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"><History className="h-3 w-3" />Version {position || versions.length} of {versions.length}</button>
		{open && <ul className="mt-1 w-72 space-y-1 rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
			{versions.map((version) => <li key={version.task.id} className="flex items-center justify-between gap-2">
				<span className={version.task.id === currentTaskId ? "font-medium text-slate-800 dark:text-slate-100" : ""}>v{version.number} · {new Date(version.task.createdAt).toLocaleString()}</span>
				<span className="flex gap-2"><a className="underline" href={fileHref(version.task, version.file)} download={version.file.name}>Download</a>{version.task.id !== currentTaskId && <button type="button" className="underline" onClick={() => void restore(version)}>Continue from this</button>}</span>
			</li>)}
		</ul>}
		{notice && <p role="status" className="mt-1">{notice}</p>}
	</div>;
}
