"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
import { useProjectStore } from "@/stores/useProjectStore";
import { PROJECT_TOOL_GROUPS } from "@/lib/project-agent/tool-groups";
import { ProjectPanelSection } from "./ProjectPanelSection";

/** Per-project tool switches. They tell the Agent which tool groups it must not use in this project. */
export function ProjectToolsSection({ projectId, disabled, canEdit }: { projectId: string; disabled: string[]; canEdit: boolean }) {
	const updateProject = useProjectStore((state) => state.updateProject);
	const [saving, setSaving] = useState<string | null>(null);
	const [error, setError] = useState("");

	async function toggle(id: string) {
		if (!canEdit || saving) return;
		setSaving(id);
		setError("");
		try {
			await updateProject(projectId, { disabledToolGroups: disabled.includes(id) ? disabled.filter((item) => item !== id) : [...disabled, id] });
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not update project tools");
		} finally { setSaving(null); }
	}

	return <ProjectPanelSection label="Tools" privacyLabel={`${PROJECT_TOOL_GROUPS.length - disabled.length} of ${PROJECT_TOOL_GROUPS.length} on`} privacyIcon={Wrench}>
		<ul className="flex flex-col gap-0.5" aria-label="Project tools">{PROJECT_TOOL_GROUPS.map((group) => {
			const on = !disabled.includes(group.id);
			return <li key={group.id}><label className={`flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${canEdit ? "cursor-pointer" : "cursor-default opacity-70"}`}>
				<input type="checkbox" checked={on} disabled={!canEdit || saving !== null} onChange={() => void toggle(group.id)} className="mt-0.5 h-3.5 w-3.5 accent-orange-600" />
				<span className="min-w-0 flex-1"><span className="block text-[12px] font-medium text-slate-700 dark:text-slate-200">{group.label}</span><span className="block text-[10px] text-slate-400">{group.description}</span></span>
			</label></li>;
		})}</ul>
		{error && <p role="alert" className="mt-1 text-[11px] text-red-600">{error}</p>}
	</ProjectPanelSection>;
}
