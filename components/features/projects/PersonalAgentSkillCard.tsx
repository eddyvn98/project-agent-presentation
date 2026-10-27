"use client";
import { Check, ChevronDown, Pencil, Trash2 } from "lucide-react";
import type { PersonalAgentSkill } from "@/lib/project-agent/personal-agent-skills";
interface Props {
  skill: PersonalAgentSkill; busy: boolean;
  onEdit(skill: PersonalAgentSkill): void; onDelete(skill: PersonalAgentSkill): void;
  onToggle(skill: PersonalAgentSkill): void;
}
export function PersonalAgentSkillCard({ skill, busy, onEdit, onDelete, onToggle }: Props) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="break-words font-semibold">{skill.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">{skill.description || "Custom instructions for your Agent."}</p>
      </div>
      <span className={"shrink-0 rounded-full px-2.5 py-1 text-xs font-medium " +
        (skill.enabled ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" :
          "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200")}>
        {skill.enabled ? "Enabled" : "Off"}
      </span>
    </div>
    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Version {skill.version} · Updated {new Date(skill.updatedAt).toLocaleDateString()}</p>
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button type="button" role="switch" aria-checked={skill.enabled}
        aria-label={skill.enabled ? "Disable " + skill.name : "Enable " + skill.name}
        disabled={busy} onClick={() => onToggle(skill)}
        className={"inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium " +
          (skill.enabled ? "border-emerald-200 text-emerald-800 dark:border-emerald-800 dark:text-emerald-300" : "border-slate-200 dark:border-slate-700")}>
        {skill.enabled && <Check className="h-3.5 w-3.5" aria-hidden="true"/>}
        {skill.enabled ? "Active across projects" : "Enable skill"}
      </button>
      <button type="button" disabled={busy} onClick={() => onEdit(skill)}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800">
        <Pencil className="h-3.5 w-3.5" aria-hidden="true"/> Edit
      </button>
      <button type="button" disabled={busy} onClick={() => onDelete(skill)}
        aria-label={"Delete " + skill.name}
        className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true"/> Delete
      </button>
    </div>
    <details className="group mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-slate-600 focus-visible:outline focus-visible:outline-2 [&::-webkit-details-marker]:hidden dark:text-slate-300">
        <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden="true"/>
        View instructions
      </summary>
      <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 font-sans text-xs leading-5 text-slate-700 dark:bg-slate-950 dark:text-slate-200">{skill.instructions}</pre>
    </details>
  </article>;
}
