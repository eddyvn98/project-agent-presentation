"use client";

import { useEffect, useState } from "react";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";

function formatDuration(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function ProjectAgentTaskDuration({ task }: { task: PublicProjectAgentTask }) {
	const running = task.status === "running" || task.status === "queued";
	const startedAt = task.startedAt ?? task.createdAt;
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		if (!running) return;
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, [running]);

	if (!startedAt) return null;
	const end = running ? now : Date.parse(task.completedAt ?? task.updatedAt);
	const elapsed = Math.max(0, Math.floor((end - Date.parse(startedAt)) / 1000));
	if (!Number.isFinite(elapsed)) return null;

	const label = running
		? `${task.status === "queued" ? "Queued" : "Processing"} · ${formatDuration(elapsed)}`
		: task.status === "done"
			? `Processed in ${formatDuration(elapsed)}`
			: task.cancelled
				? `Stopped after ${formatDuration(elapsed)}`
				: task.status === "failed" ? `Failed after ${formatDuration(elapsed)}` : null;
	if (!label) return null;
	const hint = running && elapsed > 600
		? " · This is taking much longer than usual; keep waiting, or press Stop and try again"
		: running && elapsed > 90 ? " · Documents and research can take several minutes" : "";
	return <p className="mb-1 text-xs text-slate-400 tabular-nums">{label}{hint}</p>;
}
