"use client";

import type { ProjectMemoryMode } from "@/stores/useProjectStore";

export function ProjectMemoryModeControl({
	value,
	onChange,
	disabled = false,
}: {
	value: ProjectMemoryMode;
	onChange: (mode: ProjectMemoryMode) => void;
	disabled?: boolean;
}) {
	return <fieldset className="space-y-2" disabled={disabled}>
		<legend className="text-[12px] font-medium text-slate-600 dark:text-slate-400">Memory</legend>
		<div className="grid grid-cols-2 gap-2">
			{(["DEFAULT", "PROJECT_ONLY"] as const).map((mode) => <label key={mode} className={`cursor-pointer rounded-lg border p-2.5 ${value === mode ? "border-orange-400 bg-orange-50/70 dark:bg-orange-950/20" : "border-slate-200 dark:border-slate-700"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
				<input className="sr-only" type="radio" name="project-memory-mode" value={mode} checked={value === mode} onChange={() => onChange(mode)} />
				<span className="block text-xs font-medium text-slate-800 dark:text-slate-100">{mode === "DEFAULT" ? "Default memory" : "Project-only"}</span>
				<span className="mt-1 block text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">{mode === "DEFAULT" ? "Use your recent Assistant chats alongside this Project." : "Use only chats and sources in this Project."}</span>
			</label>)}
		</div>
		{disabled && <p className="text-[10px] text-slate-500">Shared Projects always use Project-only memory.</p>}
	</fieldset>;
}
