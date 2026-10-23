"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import { LivePreviewPanel, type LivePreviewItem } from "./LivePreviewPanel";

const POLL_MS = 5000;

/** A card for each server the agent started in this conversation's sandbox; opens it beside the chat like a dev server. */
export function ProjectAgentLivePreview({ projectId, taskId, running }: { projectId: string; taskId: string; running: boolean }) {
	const [previews, setPreviews] = useState<LivePreviewItem[]>([]);
	const [openPort, setOpenPort] = useState<number | null>(null);
	const urls = useRef(new Map<number, string>());
	const load = useCallback(async (refreshUrls = false) => {
		try {
			const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(taskId)}/live`, { cache: "no-store" });
			if (!response.ok) return;
			const data = await response.json() as { previews?: LivePreviewItem[] };
			// Keep the first link of each server so a poll never reloads the frame; a reload asks for a fresh one.
			const next = (data.previews ?? []).map((item) => {
				if (refreshUrls || !urls.current.has(item.port)) urls.current.set(item.port, item.url);
				return { ...item, url: urls.current.get(item.port)! };
			});
			setPreviews(next);
		} catch { /* the card simply stays as it was */ }
	}, [projectId, taskId]);
	useEffect(() => {
		void load();
		if (!running) return;
		const timer = window.setInterval(() => void load(), POLL_MS);
		return () => window.clearInterval(timer);
	}, [load, running]);
	const open = previews.find((item) => item.port === openPort) ?? null;
	if (!previews.length && openPort === null) return null;
	return <div className="mt-3 space-y-1.5">
		{previews.map((item) => <button key={item.port} type="button" onClick={() => setOpenPort(item.port)}
			className="flex w-full items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
			<Globe className="h-4 w-4 shrink-0 text-orange-600" /><span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
			<span className="text-xs text-slate-500">Live preview · port {item.port}</span></button>)}
		{openPort !== null && <LivePreviewPanel preview={open ?? { port: openPort, title: `Port ${openPort}`, url: "" }} ended={!open}
			onReload={() => void load(true)} onClose={() => setOpenPort(null)} />}
	</div>;
}
