"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Brush, ExternalLink, Minus, Plus, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger, DialogDescription } from "./dialog";
import { safePresentationUrl } from "./presentation-source-utils";
import "./presentation-visuals.css";

export interface ProjectAgentZoomImageProps {
  src: string;
  alt: string;
  title?: string;
  label: string;
  className?: string;
  children: ReactNode;
  onMark?: () => void;
  caption?: string;
  source?: { url: string; label: string };
}

/** A fitted image viewer; zoom changes actual dimensions so scrolling reaches every detail. */
export function ProjectAgentZoomImage({
  src, alt, title, label, className, children, onMark, caption, source,
}: ProjectAgentZoomImageProps) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => { setZoom(1); setFailed(false); }, [src]);
  const zoomTo = (value: number) => setZoom(Math.max(1, Math.min(4, value)));
  const reset = () => {
    setZoom(1);
    viewport.current?.scrollTo?.({ top: 0, left: 0, behavior: "instant" });
  };
  function onKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey ||
      (event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
    if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomTo(zoom + .5); }
    else if (event.key === "-") { event.preventDefault(); zoomTo(zoom - .5); }
    else if (event.key === "0") { event.preventDefault(); reset(); }
  }
  if (!safePresentationUrl(src)) return <>{children}</>;
  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); setZoom(1); setFailed(false); }}>
    <DialogTrigger asChild><button type="button" title={title} aria-label={label} className={className}>{children}</button></DialogTrigger>
    <DialogContent className="agent-image-dialog" onKeyDown={onKeys}
      onOpenAutoFocus={(event) => { event.preventDefault(); viewport.current?.focus(); }}>
      <header className="agent-visual-heading">
        <DialogTitle>{alt || "Illustration"}</DialogTitle>
        <DialogDescription>Zoom for details; scroll to explore the image. Use +, − or 0 to adjust the view.</DialogDescription>
      </header>
      <div className="agent-visual-controls" aria-label="Image controls">
        <button type="button" className="agent-visual-control" disabled={zoom <= 1 || failed}
          onClick={() => zoomTo(zoom - .5)} aria-label="Zoom out image"><Minus aria-hidden className="h-4 w-4" /></button>
        <output aria-live="polite" className="agent-visual-zoom" title="Zoom relative to fitted width">{Math.round(zoom * 100)}%</output>
        <button type="button" className="agent-visual-control" disabled={zoom >= 4 || failed}
          onClick={() => zoomTo(zoom + .5)} aria-label="Zoom in image"><Plus aria-hidden className="h-4 w-4" /></button>
        <button type="button" className="agent-visual-control" onClick={reset} disabled={failed}>
          <RotateCcw aria-hidden className="h-3.5 w-3.5" />Reset
        </button>
        <a href={src} target="_blank" rel="noopener noreferrer" className="agent-visual-control agent-visual-open">
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />Open image<span className="sr-only"> in a new tab</span>
        </a>
        {onMark && <button type="button" className="agent-visual-control" onClick={() => { setOpen(false); onMark(); }}
          aria-label="Mark an area and request an image change"><Brush aria-hidden className="h-4 w-4" />Mark area</button>}
      </div>
      <div ref={viewport} role="region" tabIndex={0} aria-label="Enlarged image" className="agent-image-viewport">
        {failed ? <p role="status" className="agent-figure-unavailable">Image unavailable{alt ? `: ${alt}` : "."}</p> :
          <img src={src} alt={alt} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}
            style={{ width: `${zoom * 100}%`, maxWidth: "none", height: "auto" }} />}
      </div>
      {(caption || source) && <div className="agent-image-caption">
        {caption && <p>{caption}</p>}
        {source && safePresentationUrl(source.url) && <a href={source.url} target="_blank" rel="noopener noreferrer">
          {source.label || "Source"}<ExternalLink aria-hidden className="h-3 w-3" />
        </a>}
      </div>}
    </DialogContent>
  </Dialog>;
}
