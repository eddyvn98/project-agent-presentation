"use client";

import { useState, type ReactNode } from "react";
import { Brush } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/dialog";

/** Wraps a thumbnail so a click enlarges the image in a dialog on the same page instead of opening a new tab. */
export function ProjectAgentZoomImage({ src, alt, title, label, className, children, onMark }: { src: string; alt: string; title?: string; label: string; className?: string; children: ReactNode; onMark?: () => void }) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button type="button" onClick={() => setOpen(true)} title={title} aria-label={label} className={className}>{children}</button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-5xl overflow-auto p-2 sm:p-4">
					<DialogTitle className="sr-only">{alt}</DialogTitle>
					{onMark && <button type="button" onClick={() => { setOpen(false); onMark(); }} className="absolute right-3 top-3 z-10 inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 text-xs font-medium text-slate-700 shadow hover:bg-orange-50 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200" aria-label="Mark an area and request an image change"><Brush className="h-4 w-4" />Mark area</button>}
					{/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin file */}
					<img src={src} alt={alt} className="mx-auto h-auto max-h-[84dvh] w-auto max-w-full object-contain" />
				</DialogContent>
			</Dialog>
		</>
	);
}
