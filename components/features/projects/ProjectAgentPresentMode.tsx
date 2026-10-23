"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { PdfPageCanvas, type PdfPageInfo } from "./usePdfDocument";

/** Full-screen slide show: one page at a time, arrow keys, space or click to advance, Esc to leave, a short fade between slides. */
export function ProjectAgentPresentMode({ doc, pages, start, onClose }: { doc: PDFDocumentProxy; pages: PdfPageInfo[]; start: number; onClose: (page: number) => void }) {
	const [page, setPage] = useState(start);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const root = useRef<HTMLDivElement>(null);
	const last = pages.length;
	useEffect(() => {
		const element = root.current;
		void element?.requestFullscreen?.().catch(() => undefined);
		const measure = () => setSize({ width: window.innerWidth, height: window.innerHeight });
		measure();
		window.addEventListener("resize", measure);
		const leave = () => { if (!document.fullscreenElement) onClose(pageRef.current); };
		document.addEventListener("fullscreenchange", leave);
		return () => { window.removeEventListener("resize", measure); document.removeEventListener("fullscreenchange", leave); if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); };
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	const pageRef = useRef(page);
	pageRef.current = page;
	useEffect(() => {
		const keydown = (event: KeyboardEvent) => {
			if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(event.key)) { event.preventDefault(); setPage((value) => Math.min(last, value + 1)); }
			if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(event.key)) { event.preventDefault(); setPage((value) => Math.max(1, value - 1)); }
			if (event.key === "Home") setPage(1);
			if (event.key === "End") setPage(last);
			if (event.key === "Escape") onClose(pageRef.current);
		};
		window.addEventListener("keydown", keydown);
		return () => window.removeEventListener("keydown", keydown);
	}, [last, onClose]);
	const info = pages[page - 1];
	const width = info && size.width ? Math.min(size.width, (size.height * info.width) / info.height) : 0;
	return <div ref={root} role="dialog" aria-label="Presentation" className="fixed inset-0 z-[200] flex items-center justify-center bg-black" onClick={() => setPage((value) => Math.min(last, value + 1))}>
		{width > 0 && <div key={page} className="animate-[fadeIn_300ms_ease-out]"><PdfPageCanvas doc={doc} page={page} width={width} /></div>}
		<style>{"@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }"}</style>
		<div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white opacity-0 transition-opacity hover:opacity-100" onClick={(event) => event.stopPropagation()}>
			<button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous slide"><ChevronLeft className="h-4 w-4" /></button>
			<span className="tabular-nums">{page} / {last}</span>
			<button type="button" onClick={() => setPage((value) => Math.min(last, value + 1))} aria-label="Next slide"><ChevronRight className="h-4 w-4" /></button>
			<button type="button" onClick={() => onClose(page)} aria-label="Exit presentation"><X className="h-4 w-4" /></button>
		</div>
	</div>;
}
