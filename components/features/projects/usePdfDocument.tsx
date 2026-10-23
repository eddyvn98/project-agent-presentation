"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdfDocument } from "@/app/workspace/utils/pdfPages";

export interface PdfPageInfo { width: number; height: number }

/** Loads a PDF once and reports its page sizes (in CSS pixels at 100%), so pages can be laid out before they render. */
export function usePdfDocument(url: string) {
	const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
	const [pages, setPages] = useState<PdfPageInfo[]>([]);
	const [error, setError] = useState("");
	useEffect(() => {
		let cancelled = false;
		setDoc(null); setPages([]); setError("");
		void loadPdfDocument(url).then(async (loaded) => {
			const size = async (index: number): Promise<PdfPageInfo> => {
				const viewport = (await loaded.getPage(index)).getViewport({ scale: 96 / 72 });
				return { width: viewport.width, height: viewport.height };
			};
			// Show the document as soon as the first page is known (every page assumed the same size), then measure the rest in batches, so a large PDF paints before all of it has arrived.
			const first = await size(1);
			const sizes: PdfPageInfo[] = Array.from({ length: loaded.numPages }, () => first);
			if (cancelled) return;
			setDoc(loaded); setPages([...sizes]);
			for (let start = 2; start <= loaded.numPages && !cancelled; start += 20) {
				const batch = await Promise.all(Array.from({ length: Math.min(20, loaded.numPages - start + 1) }, (_, offset) => size(start + offset)));
				batch.forEach((info, offset) => { sizes[start + offset - 1] = info; });
				if (!cancelled && batch.some((info) => info.width !== first.width || info.height !== first.height)) setPages([...sizes]);
			}
		}).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load the document"); });
		return () => { cancelled = true; };
	}, [url]);
	return { doc, pages, error };
}

/** Draws one page into a canvas at the given CSS width, sharp on high-density screens; re-renders when the width changes. */
export function PdfPageCanvas({ doc, page, width, className }: { doc: PDFDocumentProxy; page: number; width: number; className?: string }) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		let cancelled = false;
		let task: { cancel: () => void; promise: Promise<void> } | undefined;
		void doc.getPage(page).then((pdfPage) => {
			const canvas = ref.current;
			if (cancelled || !canvas) return;
			const ratio = Math.min(2, window.devicePixelRatio || 1);
			const viewport = pdfPage.getViewport({ scale: (width * ratio) / pdfPage.getViewport({ scale: 1 }).width });
			canvas.width = Math.round(viewport.width);
			canvas.height = Math.round(viewport.height);
			const context = canvas.getContext("2d");
			if (!context) return;
			task = pdfPage.render({ canvasContext: context, viewport }) as unknown as { cancel: () => void; promise: Promise<void> };
			return task.promise.catch(() => undefined);
		});
		return () => { cancelled = true; task?.cancel(); };
	}, [doc, page, width]);
	return <canvas ref={ref} className={className} style={{ width, height: "auto", display: "block" }} />;
}
