"use client";

import { Check, Circle, Loader2 } from "lucide-react";
import type { PlanItem } from "@/lib/project-agent/plan";

/** The agent's own checklist for a multi-step task: it updates as the agent works, so the user sees where it is. */
export function ProjectAgentPlan({ items, running }: { items: PlanItem[]; running: boolean }) {
	const done = items.filter((item) => item.status === "done").length;
	return <section aria-label="Plan" className="not-prose mb-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/60">
		<p className="mb-1 text-xs font-medium text-slate-500">Plan · {done}/{items.length}</p>
		<ol className="space-y-1">
			{items.map((item, index) => <li key={index} className={`flex items-start gap-2 ${item.status === "done" ? "text-slate-400 line-through" : "text-slate-700 dark:text-slate-200"}`}>
				<span className="mt-0.5 shrink-0" aria-label={item.status}>{item.status === "done" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : item.status === "doing" && running ? <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" /> : <Circle className="h-3.5 w-3.5 text-slate-300" />}</span>
				<span>{item.text}</span>
			</li>)}
		</ol>
	</section>;
}
