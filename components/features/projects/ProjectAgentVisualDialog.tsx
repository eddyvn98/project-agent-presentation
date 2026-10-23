"use client";

import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Makes a diagram scrollable at every zoom level instead of cropping it to the viewport. */
export function ProjectAgentVisualDialog({ label, children, width = 800 }: {
	label: string;
	children: ReactNode;
	width?: number;
}) {
	const [zoom, setZoom] = useState(1);
	return <Dialog onOpenChange={() => setZoom(1)}>
		<DialogTrigger asChild><button type="button" className="min-h-10 rounded-lg border px-3 text-sm focus-visible:ring-2" aria-label={`Enlarge ${label}`}>Enlarge</button></DialogTrigger>
		<DialogContent className="flex w-[calc(100vw-1rem)] max-w-6xl flex-col overflow-hidden bg-white dark:bg-slate-900">
			<DialogTitle className="pr-8">{label}</DialogTitle>
			<DialogDescription>Zoom to read labels. Scroll horizontally or vertically to explore.</DialogDescription>
			<div className="flex flex-wrap items-center gap-2">
				<button type="button" className="min-h-10 rounded border px-3" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}>−</button>
				<output aria-live="polite" className="min-w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</output>
				<button type="button" className="min-h-10 rounded border px-3" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom(Math.min(4, zoom + 0.25))}>+</button>
				<button type="button" className="min-h-10 rounded border px-3" onClick={() => setZoom(1)}>Reset</button>
			</div>
			<div role="region" aria-label={`Enlarged ${label}`} tabIndex={0} className="min-h-0 overflow-auto rounded border bg-white p-3" style={{ maxHeight: "65dvh" }}>
				<div style={{ width: width * zoom, maxWidth: "none" }}>{children}</div>
			</div>
		</DialogContent>
	</Dialog>;
}
