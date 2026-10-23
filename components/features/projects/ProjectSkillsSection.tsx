"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useProjectStore } from "@/stores/useProjectStore";
import { useCustomizeStore } from "@/stores/useCustomizeStore";
import { useSkillLibraryStore } from "@/stores/useSkillLibraryStore";
import { ProjectPanelSection } from "./ProjectPanelSection";

/** Per-project switches for the reusable skills of the user's Skill library; enabled ones are sent to the Agent with every task. */
export function ProjectSkillsSection({ projectId, skillIds, canEdit, onManage }: { projectId: string; skillIds: string[]; canEdit: boolean; onManage?: () => void }) {
	const skills = useSkillLibraryStore((state) => state.skills);
	const loading = useSkillLibraryStore((state) => state.isLoading);
	const fetchSkills = useSkillLibraryStore((state) => state.fetchSkills);
	const updateProject = useProjectStore((state) => state.updateProject);
	const [savingId, setSavingId] = useState<string | null>(null);
	const [error, setError] = useState("");

	useEffect(() => { void fetchSkills(); }, [fetchSkills]);
	const openLibrary = useCustomizeStore((state) => state.openLibrary);
	const manage = () => { onManage?.(); openLibrary("skills", "my"); };

	async function toggle(id: string) {
		if (!canEdit || savingId) return;
		setSavingId(id);
		setError("");
		try {
			const next = skillIds.includes(id) ? skillIds.filter((item) => item !== id) : [...skillIds, id];
			await updateProject(projectId, { skillIds: next });
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not update project skills");
		} finally { setSavingId(null); }
	}

	return <ProjectPanelSection label="Skills" privacyLabel={`${skillIds.length} on`} privacyIcon={Sparkles}>
		{loading && skills.length === 0 ? <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
			: skills.length === 0 ? <p className="py-2 text-[12px] text-slate-400">No skills in your Skill library yet. Create or import one, then switch it on here for this project.</p>
			: <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto" aria-label="Project skills">{skills.map((skill) => {
				const on = skillIds.includes(skill.id);
				return <li key={skill.id}><label className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${!canEdit ? "cursor-default opacity-70" : ""}`}>
					<input type="checkbox" checked={on} disabled={!canEdit || savingId !== null} onChange={() => void toggle(skill.id)} className="mt-0.5 h-3.5 w-3.5 accent-orange-600" />
					<span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-medium text-slate-700 dark:text-slate-200">{skill.title}</span>{skill.description && <span className="block truncate text-[10px] text-slate-400">{skill.description}</span>}</span>
					{savingId === skill.id && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
				</label></li>;
			})}</ul>}
		<button type="button" onClick={manage} className="mt-2 rounded-full border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{skills.length === 0 ? "Create or import a skill" : "Manage skills"}</button>
		{error && <p role="alert" className="mt-1 text-[11px] text-red-600">{error}</p>}
	</ProjectPanelSection>;
}
