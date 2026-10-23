"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProjectStore, type KnowledgeFile } from "@/stores/useProjectStore";

/** Reads and edits the text of a source the agent wrote: a saved web page, the runbook or the work log. */
export function ProjectAgentSourceEditor({ projectId, file, canEdit, onClose }: { projectId: string; file: KnowledgeFile; canEdit: boolean; onClose: () => void }) {
	const refreshProject = useProjectStore((state) => state.refreshProject);
	const url = `/api/projects/${encodeURIComponent(projectId)}/knowledge/text`;
	const [name, setName] = useState(file.name);
	const [text, setText] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const isRunbook = file.managed === "runbook";

	useEffect(() => {
		let cancelled = false;
		fetch(`${url}?fileId=${encodeURIComponent(file.id)}`)
			.then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not load"); if (!cancelled) setText(body.text); })
			.catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load"); });
		return () => { cancelled = true; };
	}, [url, file.id]);

	async function save() {
		if (text === null || saving) return;
		setSaving(true); setError("");
		try {
			const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: file.id, text, name }) });
			if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Could not save");
			await refreshProject(projectId);
			onClose();
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save"); }
		finally { setSaving(false); }
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="bg-white sm:max-w-[640px] dark:bg-slate-900">
				<DialogHeader><DialogTitle className="text-lg font-semibold">{file.managed ? file.name : "Saved source"}</DialogTitle></DialogHeader>
				{isRunbook ? <p className="text-sm text-slate-500">One rule per line. The agent follows these in every chat of this project. You can also ask it in chat to change or remove a rule.</p> : null}
				{file.sourceUrl ? <a href={file.sourceUrl} target="_blank" rel="noopener noreferrer" className="truncate text-sm text-sky-700 hover:underline">{file.sourceUrl}</a> : null}
				{!file.managed && canEdit ? <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Source title" className="rounded-xl border border-slate-200 px-3 py-2 text-[15px] outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950" /> : null}
				{text === null && !error ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div> : (
					<textarea value={text ?? ""} onChange={(event) => setText(event.target.value)} readOnly={!canEdit} rows={14} aria-label="Source text" className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-[13px] leading-relaxed outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950" />
				)}
				{error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
				<div className="flex justify-end gap-2">
					<button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">{canEdit ? "Cancel" : "Close"}</button>
					{canEdit ? <button type="button" onClick={() => void save()} disabled={saving || text === null} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save</button> : null}
				</div>
			</DialogContent>
		</Dialog>
	);
}
