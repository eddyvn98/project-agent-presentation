"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, Users, X } from "lucide-react";
import { useProjectStore } from "@/stores/useProjectStore";
import { ProjectPanelSection } from "./ProjectPanelSection";

export function ProjectInstructionsSection({
	projectId,
	instructions,
	canEdit,
}: {
	projectId: string;
	instructions: string;
	canEdit: boolean;
}) {
	const updateProject = useProjectStore((state) => state.updateProject);
	const [editing, setEditing] = useState(false);
	const [value, setValue] = useState(instructions);
	const [saving, setSaving] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		setEditing(false);
		setValue(instructions);
	}, [projectId, instructions]);

	useEffect(() => {
		if (editing && canEdit) setTimeout(() => textareaRef.current?.focus(), 50);
	}, [editing, canEdit]);

	async function save() {
		setSaving(true);
		try {
			await updateProject(projectId, { instructions: value });
			setEditing(false);
		} finally {
			setSaving(false);
		}
	}

	return (
		<ProjectPanelSection label="Instructions" privacyLabel="All project users" privacyIcon={Users} action={canEdit && !editing ? (
			<button onClick={() => setEditing(true)} className="ml-1 p-1 rounded text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30" title="Edit instructions"><Plus className="w-3.5 h-3.5" /></button>
		) : undefined}>
			{editing && canEdit ? <div className="flex flex-col gap-1.5">
				<textarea ref={textareaRef} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => {
					if (event.key === "Escape") { setEditing(false); setValue(instructions); }
					if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void save();
				}} rows={6} placeholder="Add instructions to tailor AI's responses…" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm leading-6 text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400/50 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300 resize-none" />
				<div className="flex items-center gap-1.5 justify-end">
					<span className="text-xs text-gray-400 mr-auto">⌘↵ save · Esc to cancel</span>
					<button onClick={() => { setEditing(false); setValue(instructions); }} className="p-1 rounded text-gray-400" title="Cancel"><X className="w-3.5 h-3.5" /></button>
					<button onClick={() => void save()} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50">{saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}Save</button>
				</div>
			</div> : instructions ? canEdit ? <button onClick={() => setEditing(true)} className="w-full text-left group">
				<p className="text-sm text-gray-600 dark:text-gray-400 leading-6 line-clamp-5">{instructions}</p>
				<span className="mt-2 inline-flex text-xs text-gray-400 group-hover:text-orange-500">Click to edit</span>
			</button> : <p className="text-sm text-gray-600 dark:text-gray-400 leading-6">{instructions}</p> : canEdit ? <button onClick={() => setEditing(true)} className="text-sm text-gray-400 italic hover:text-orange-500 text-left">Add instructions to tailor AI&apos;s responses</button> : <p className="text-sm text-gray-400 italic">No project instructions.</p>}
		</ProjectPanelSection>
	);
}
