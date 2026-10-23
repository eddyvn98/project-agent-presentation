"use client";

import { useRef, useState, type PointerEvent } from "react";

export interface PageRegion { x: number; y: number; width: number; height: number }

const percent = (value: number) => Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;

/**
 * Request edits: drag a box over a page, describe the change, and send it to the agent. Coordinates are percent of
 * the page so they do not depend on zoom.
 */
export function ProjectAgentRegionSelect({ onSubmit }: { onSubmit: (region: PageRegion, note: string) => void }) {
	const box = useRef<HTMLDivElement>(null);
	const [start, setStart] = useState<{ x: number; y: number } | null>(null);
	const [region, setRegion] = useState<PageRegion | null>(null);
	const [note, setNote] = useState("");
	const [drawing, setDrawing] = useState(false);
	const point = (event: PointerEvent) => {
		const rect = box.current!.getBoundingClientRect();
		return { x: percent(((event.clientX - rect.left) / rect.width) * 100), y: percent(((event.clientY - rect.top) / rect.height) * 100) };
	};
	const down = (event: PointerEvent<HTMLDivElement>) => {
		if (event.target !== box.current) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		const at = point(event);
		setStart(at); setRegion({ x: at.x, y: at.y, width: 0, height: 0 }); setDrawing(true); setNote("");
	};
	const move = (event: PointerEvent<HTMLDivElement>) => {
		if (!drawing || !start) return;
		const at = point(event);
		setRegion({ x: Math.min(start.x, at.x), y: Math.min(start.y, at.y), width: Math.abs(at.x - start.x), height: Math.abs(at.y - start.y) });
	};
	const up = () => {
		setDrawing(false);
		if (region && (region.width < 1 || region.height < 1)) setRegion(null);
	};
	const submit = () => { if (region && note.trim()) { onSubmit(region, note.trim()); setRegion(null); setNote(""); } };
	return <div ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} className="absolute inset-0 cursor-crosshair" aria-label="Drag to mark the area to change">
		{region && <div className="pointer-events-none absolute rounded border-2 border-orange-500 bg-orange-500/10" style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.width}%`, height: `${region.height}%` }} />}
		{region && !drawing && region.width >= 1 && <div className="absolute z-10 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900" style={{ left: `${Math.min(region.x, 60)}%`, top: `${Math.min(region.y + region.height, 85)}%` }} onPointerDown={(event) => event.stopPropagation()}>
			<textarea autoFocus value={note} onChange={(event) => setNote(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } if (event.key === "Escape") setRegion(null); }} placeholder="Describe the change for this area" rows={2} className="w-full resize-none rounded border border-slate-200 p-1.5 text-xs outline-none focus:border-orange-400 dark:border-slate-700 dark:bg-slate-950" />
			<div className="mt-1 flex justify-end gap-2 text-xs">
				<button type="button" onClick={() => setRegion(null)} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
				<button type="button" onClick={submit} disabled={!note.trim()} className="rounded bg-orange-600 px-2 py-1 font-medium text-white disabled:opacity-40">Send</button>
			</div>
		</div>}
	</div>;
}
