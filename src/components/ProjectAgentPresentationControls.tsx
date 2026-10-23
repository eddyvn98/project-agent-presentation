"use client";

import { useEffect, useState } from "react";
import { usePresentationCopy } from "./presentation-copy";

export function ProjectAgentPresentationControls({ presenting, index, count, markdown, onToggle, onMove, onFullscreen, onPrint }: {
  presenting: boolean; index: number; count: number; markdown: string;
  onToggle: () => void; onMove: (next: number) => void; onFullscreen: () => Promise<void>; onPrint: () => void;
}) {
  const { copy, status, reset } = usePresentationCopy();
  const [error, setError] = useState("");
  useEffect(reset, [markdown, reset]);
  return <nav className="agent-deck-controls not-prose" aria-label="Answer presentation controls" data-agent-control>
    <button type="button" aria-pressed={presenting} onClick={onToggle}>
      {presenting ? "Read full answer" : "Present as slides"}
    </button>
    {presenting && <>
      <button type="button" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label="Previous slide">Previous</button>
      <output aria-live="polite" className="tabular-nums">{index + 1} / {count}</output>
      <button type="button" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label="Next slide">Next</button>
      <button type="button" onClick={() => { setError(""); void onFullscreen().catch(() => setError("Fullscreen is unavailable in this browser.")); }}>Fullscreen</button>
    </>}
    <button type="button" onClick={() => { setError(""); void copy(markdown); }}>Copy Markdown</button>
    <button type="button" onClick={onPrint}>Print / save PDF</button>
    {(error || status !== "idle") && <span role="status" className="agent-action-feedback">{error ||
      (status === "copied" ? "Markdown copied" : "Copy failed. Select the text and copy it manually.")}</span>}
  </nav>;
}
