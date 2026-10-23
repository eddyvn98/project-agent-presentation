"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Brush, Loader2, X } from "lucide-react";
import type { LineShape } from "@/components/features/chat/image-preferences/brush-mask-editor";
import type { ProjectAgentTaskFile } from "@/lib/project-agent/types";
import { composeMarkedImage } from "./markedImage";
import { ProjectAgentZoomImage } from "./ProjectAgentZoomImage";

const BrushMaskModal = dynamic(() => import("@/components/features/chat/image-preferences/brush-mask-modal").then((mod) => mod.BrushMaskModal), { ssr: false });

interface Props {
	files: ProjectAgentTaskFile[];
	fileUrl: (file: ProjectAgentTaskFile) => string;
	disabled?: boolean;
	viewer?: boolean;
	onRedo: (marked: File, instruction: string, original: ProjectAgentTaskFile) => void;
}

const isImage = (file: ProjectAgentTaskFile) => file.mimeType.startsWith("image/") && file.mimeType !== "image/svg+xml";

/** Generated images shown right in the chat, with the existing brush tool to mark an area and ask for a redo. */
export function ProjectAgentImageGallery({ files, fileUrl, disabled, viewer = false, onRedo }: Props) {
	const images = files.filter(isImage);
	const viewUrl = (file: ProjectAgentTaskFile) => file.savedToProjectFileId ? fileUrl(file) : `${fileUrl(file)}?preview=1`;
	const [marking, setMarking] = useState<ProjectAgentTaskFile | null>(null);
	const [lines, setLines] = useState<LineShape[]>([]);
	const [editing, setEditing] = useState<ProjectAgentTaskFile | null>(null);
	const [instruction, setInstruction] = useState("");
	const [working, setWorking] = useState(false);
	const [error, setError] = useState("");
	if (!images.length) return null;

	const close = () => { setEditing(null); setMarking(null); setLines([]); setInstruction(""); setError(""); };
	async function submit() {
		if (!editing || !instruction.trim()) return;
		setWorking(true);
		setError("");
		try { onRedo(await composeMarkedImage(fileUrl(editing), lines, editing.name), instruction.trim(), editing); close(); }
		catch (cause) { setError(cause instanceof Error ? cause.message : "Could not prepare the image"); }
		finally { setWorking(false); }
	}

	return <div className={`${viewer ? "grid h-full place-items-center" : "mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3"}`}>
		{images.map((file) => <figure key={file.id} className={`group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 ${viewer ? "h-full w-full" : "aspect-square"}`}>
			<ProjectAgentZoomImage src={viewUrl(file)} alt={file.name} title={file.name} label={`Enlarge ${file.name}`} className={`block h-full w-full ${viewer ? "" : "p-1"}`} onMark={() => { setLines([]); setMarking(file); }}><img src={viewUrl(file)} alt={file.name} loading="lazy" className="h-full w-full object-contain" /></ProjectAgentZoomImage>
			<button type="button" disabled={disabled} onClick={() => { setLines([]); setMarking(file); }} aria-label={`Mark an area of ${file.name} and redo`} title="Mark an area and redo" className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-orange-700 shadow hover:bg-orange-50 disabled:opacity-50 dark:bg-slate-900/90 dark:text-orange-300"><Brush className="h-4 w-4" /></button>
		</figure>)}
		{marking && <BrushMaskModal isOpen imageUrl={fileUrl(marking)} lines={lines} onLinesChange={setLines} onClose={() => { if (lines.length) setEditing(marking); setMarking(null); }} />}
		{editing && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/40 p-4 sm:items-center">
			<div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900">
				<div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">What should change in the marked area?</p><button type="button" onClick={close} aria-label="Cancel"><X className="h-4 w-4" /></button></div>
				<textarea autoFocus value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={3} placeholder="For example: replace the sofa with a walnut bench" className="w-full rounded-xl border border-slate-200 p-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
				{error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
				<div className="mt-3 flex justify-end gap-2"><button type="button" onClick={close} className="rounded-lg px-3 py-1.5 text-sm text-slate-600">Cancel</button><button type="button" disabled={working || !instruction.trim()} onClick={() => void submit()} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">{working && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Redo image</button></div>
			</div>
		</div>}
	</div>;
}
