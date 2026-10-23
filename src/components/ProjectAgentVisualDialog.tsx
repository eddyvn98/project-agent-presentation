"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Maximize2, Minus, Plus, RotateCcw, Scan } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./dialog";
import "./presentation-visuals.css";

/** Preserve native label size initially, with explicit fit and layout-based zoom controls. */
export function ProjectAgentVisualDialog({ label, children, width = 800 }: {
  label: string; children: ReactNode; width?: number;
}) {
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const nativeWidth = Number.isFinite(width) && width > 0 ? width : 800;
  const zoomTo = (value: number) => setZoom(Math.max(.1, Math.min(4, value)));
  function reset() {
    setZoom(1);
    viewport.current?.scrollTo?.({ top: 0, left: 0, behavior: "instant" });
  }
  function fit() {
    if (!viewport.current) return;
    zoomTo((viewport.current.clientWidth - 24) / nativeWidth);
    viewport.current.scrollTo?.({ top: 0, left: 0, behavior: "instant" });
  }
  function onKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey ||
      (event.target as HTMLElement).closest("input, textarea, select, [role=slider], [contenteditable=true]")) return;
    if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomTo(zoom + .25); }
    else if (event.key === "-") { event.preventDefault(); zoomTo(zoom - .25); }
    else if (event.key === "0") { event.preventDefault(); reset(); }
  }
  return <Dialog onOpenChange={() => setZoom(1)}>
    <DialogTrigger asChild><button type="button" className="agent-visual-control" aria-label={`Enlarge ${label}`}>
      <Maximize2 aria-hidden className="h-3.5 w-3.5" />Enlarge
    </button></DialogTrigger>
    <DialogContent className="agent-visual-dialog" onKeyDown={onKeys}
      onOpenAutoFocus={(event) => { event.preventDefault(); viewport.current?.focus(); }}>
      <header className="agent-visual-heading">
        <DialogTitle>{label}</DialogTitle>
        <DialogDescription>Zoom to read labels. Scroll horizontally or vertically to explore. Use +, − or 0 to adjust the view.</DialogDescription>
      </header>
      <div className="agent-visual-controls" aria-label="Visual controls">
        <button type="button" className="agent-visual-control" aria-label="Zoom out" disabled={zoom <= .1}
          onClick={() => zoomTo(zoom - .25)}><Minus aria-hidden className="h-4 w-4" /></button>
        <output aria-live="polite" className="agent-visual-zoom">{Math.round(zoom * 100)}%</output>
        <button type="button" className="agent-visual-control" aria-label="Zoom in" disabled={zoom >= 4}
          onClick={() => zoomTo(zoom + .25)}><Plus aria-hidden className="h-4 w-4" /></button>
        <button type="button" className="agent-visual-control" onClick={reset}><RotateCcw aria-hidden className="h-3.5 w-3.5" />Reset</button>
        <button type="button" className="agent-visual-control" onClick={fit}><Scan aria-hidden className="h-3.5 w-3.5" />Fit to width</button>
      </div>
      <div ref={viewport} role="region" aria-label={`Enlarged ${label}`} tabIndex={0} className="agent-visual-viewport">
        <div style={{ width: nativeWidth * zoom, maxWidth: "none" }}>{children}</div>
      </div>
    </DialogContent>
  </Dialog>;
}
