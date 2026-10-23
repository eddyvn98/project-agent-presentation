"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag, Pause, Play, X } from "lucide-react";
import type { ChatGoal } from "@/lib/project-agent/goal-store";

const LABEL: Record<ChatGoal["status"], string> = { active: "Working toward the goal", paused: "Goal paused", done: "Goal reached", budget: "Goal stopped at its limit", stalled: "Goal stopped: no progress", failed: "Goal stopped: a turn failed" };

/** The chat's goal above the composer: what it is, which turn it is on, and pause, resume or clear. */
export function ProjectAgentGoalBar({ projectId, conversationId }: { projectId: string; conversationId: string | null | undefined }) {
	const [goal, setGoal] = useState<ChatGoal | null>(null);
	const url = conversationId ? `/api/projects/${encodeURIComponent(projectId)}/agent/goal?conversationId=${encodeURIComponent(conversationId)}` : null;
	useEffect(() => {
		if (!url) { setGoal(null); return; }
		let cancelled = false;
		const load = async () => {
			try { const response = await fetch(url); if (response.ok && !cancelled) setGoal(((await response.json()) as { goal: ChatGoal | null }).goal); } catch { /* the bar is optional */ }
		};
		void load();
		const timer = window.setInterval(() => void load(), 3000);
		return () => { cancelled = true; window.clearInterval(timer); };
	}, [url]);
	const act = useCallback(async (action: "pause" | "resume" | "clear") => {
		if (!url) return;
		const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
		if (response?.ok) setGoal(((await response.json()) as { goal: ChatGoal | null }).goal);
	}, [url]);
	if (!goal) return null;
	const button = "rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800";
	return <div role="status" aria-label="Goal" className="mx-auto flex w-full max-w-3xl items-start gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/70">
		<Flag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
		<div className="min-w-0 flex-1">
			<p className="truncate font-medium text-slate-700 dark:text-slate-200" title={goal.objective}>{goal.objective}</p>
			<p className="text-slate-500">{LABEL[goal.status]} · turn {Math.min(goal.turnsUsed + (goal.status === "active" ? 1 : 0), goal.maxTurns)} of {goal.maxTurns}{goal.missing.length && goal.status !== "done" ? ` · missing: ${goal.missing.join("; ")}` : ""}</p>
		</div>
		{goal.status === "active" && <button type="button" className={button} onClick={() => void act("pause")} aria-label="Pause goal" title="Pause"><Pause className="h-3.5 w-3.5" /></button>}
		{(goal.status === "paused" || goal.status === "budget" || goal.status === "stalled" || goal.status === "failed") && <button type="button" className={button} onClick={() => void act("resume")} aria-label="Resume goal" title="Resume"><Play className="h-3.5 w-3.5" /></button>}
		<button type="button" className={button} onClick={() => void act("clear")} aria-label="Clear goal" title="Clear"><X className="h-3.5 w-3.5" /></button>
	</div>;
}
