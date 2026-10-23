"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MessageSquareQuote, X } from "lucide-react";

export type AnswerQuote = { text: string };

export function ProjectAgentSelectionAction({ children, onQuote }: {
  children: ReactNode; onQuote?: (quote: AnswerQuote) => void | Promise<void>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<(AnswerQuote & { left: number; top: number }) | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!onQuote) { setSelection(null); return; }
    const update = () => {
      const selected = window.getSelection();
      if (!selected || !selected.rangeCount || selected.isCollapsed) { setSelection(null); return; }
      const range = selected.getRangeAt(0);
      const root = container.current;
      if (!root?.contains(range.startContainer) || !root.contains(range.endContainer)) { setSelection(null); return; }
      const parent = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
      if (parent?.closest("input, textarea, button, [data-agent-control], [role=dialog]")) { setSelection(null); return; }
      const text = selected.toString().trim();
      const rect = range.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) { setSelection(null); return; }
      setSelection(text && text.length <= 4000 ? { text,
        left: Math.max(8, Math.min(window.innerWidth - 240, rect.left)),
        top: Math.max(8, Math.min(window.innerHeight - 56, rect.bottom + 8)),
      } : null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setSelection(null); };
    document.addEventListener("selectionchange", update);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    update();
    return () => {
      document.removeEventListener("selectionchange", update); document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update);
    };
  }, [onQuote]);
  async function quote() {
    if (!selection || !onQuote || locked.current) return;
    const text = selection.text;
    locked.current = true; setBusy(true); setError("");
    try {
      await onQuote({ text });
      if (!mounted.current) return;
      restoreFocus();
      setSelection((current) => current?.text === text ? null : current);
      if (window.getSelection()?.toString().trim() === text) window.getSelection()?.removeAllRanges();
    } catch { if (mounted.current) setError("Could not use this selection. Please try again."); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  function restoreFocus() {
    if (document.activeElement?.closest(".agent-selection-action")?.parentElement === container.current) {
      container.current?.focus({ preventScroll: true });
    }
  }
  return <div ref={container} className="agent-selection-container" tabIndex={-1}>
    {children}
    {selection && onQuote && <div className="agent-selection-action not-prose" role="group" aria-label="Selected text actions"
      style={{ left: selection.left, top: selection.top }} data-agent-control>
      <button type="button" disabled={busy} onPointerDown={(event) => event.preventDefault()} onClick={() => void quote()}>
        <MessageSquareQuote aria-hidden />Ask about selection
      </button>
      <button type="button" disabled={busy} aria-label="Dismiss selected text action" onClick={() => { restoreFocus(); setSelection(null); }}><X aria-hidden /></button>
    </div>}
    {error && <p role="alert" className="agent-action-feedback">{error}</p>}
  </div>;
}
