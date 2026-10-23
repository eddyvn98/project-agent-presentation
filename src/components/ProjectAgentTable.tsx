"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Download, Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./dialog";
import { downloadPresentationText, usePresentationCopy } from "./presentation-copy";
import { readRenderedTable, serializeTable, spreadsheetSafeCell } from "@/lib/markdown/table-export";
import "./code-table.css";

export interface ProjectAgentTableProps {
  children: ReactNode;
  label?: string;
}

export function ProjectAgentTable({ children, label = "Response table" }: ProjectAgentTableProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ overflow: false, start: true, end: true });
  const [exportError, setExportError] = useState(false);
  const [escaped, setEscaped] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const { copy, status, reset } = usePresentationCopy();
  const descriptionId = useId();
  const previousData = useRef<string | null>(null);
  useEffect(() => {
    if (!tableRef.current) return;
    const data = JSON.stringify(readRenderedTable(tableRef.current));
    if (previousData.current !== null && previousData.current !== data) {
      reset(); setDownloaded(false); setExportError(false); setEscaped(false);
    }
    previousData.current = data;
  }, [children, reset]);
  const updateEdges = () => {
    const region = scrollRef.current;
    if (!region) return;
    const overflow = region.scrollWidth > region.clientWidth + 2;
    const start = region.scrollLeft <= 2;
    const end = region.scrollLeft + region.clientWidth >= region.scrollWidth - 2;
    setEdges((previous) => previous.overflow === overflow && previous.start === start && previous.end === end ? previous : { overflow, start, end });
  };
  useEffect(() => {
    updateEdges();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateEdges);
      if (scrollRef.current) observer.observe(scrollRef.current);
      if (tableRef.current) observer.observe(tableRef.current);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, [children]);
  const exportData = () => {
    if (!tableRef.current) throw new Error("Table unavailable");
    const rows = readRenderedTable(tableRef.current);
    setEscaped(rows.some((row) => row.some((cell) => spreadsheetSafeCell(cell) !== cell)));
    return rows;
  };
  const copyTable = async () => {
    setExportError(false); setDownloaded(false);
    try { await copy(serializeTable(exportData(), "\t")); }
    catch { setExportError(true); }
  };
  const download = () => {
    setExportError(false); reset();
    try {
      downloadPresentationText(`\uFEFF${serializeTable(exportData())}`, "table.csv", "text/csv;charset=utf-8");
      setDownloaded(true);
    } catch { setExportError(true); }
  };
  const actions = <>
    <button type="button" className="agent-data-action" aria-label="Copy table" title="Copy as tab-separated values" onClick={() => void copyTable()}>
      {status === "copied" ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}<span>{status === "copied" ? "Copied" : "Copy"}</span>
    </button>
    <button type="button" className="agent-data-action" aria-label="Download table as CSV" title="Download CSV" onClick={download}><Download aria-hidden="true" size={16} /><span>CSV</span></button>
  </>;
  const feedback = <div className="agent-data-feedback" role="status" aria-live="polite" aria-atomic="true">
    {status === "error" || exportError ? <span>Could not export the table. Select its cells to copy them manually.</span> : <>
      {status === "copied" && <span className="sr-only">Table copied.</span>}
      {downloaded && <span className="sr-only">CSV download requested.</span>}
      {(status === "copied" || downloaded) && escaped && <span>Formula-like values were exported as text.</span>}
    </>}
  </div>;
  return <Dialog>
    <figure className="agent-table-card not-prose">
      <figcaption className="agent-data-toolbar">
        <span className="agent-data-label">{label === "Response table" ? "Table" : label}</span>
        <div className="agent-data-actions">{actions}
          <DialogTrigger asChild><button type="button" className="agent-data-action" aria-label="Expand table" title="Expand table"><Maximize2 aria-hidden="true" size={16} /></button></DialogTrigger>
        </div>
      </figcaption>
      {feedback}
      <div ref={scrollRef} role="region" aria-label="Scrollable response table" aria-describedby={edges.overflow ? descriptionId : undefined} tabIndex={0}
        className="agent-table-scroll" onScroll={updateEdges}>
        <table ref={tableRef} aria-label={label}>{children}</table>
      </div>
      {edges.overflow && <div className="agent-table-scroll-hint">
        <span id={descriptionId}>Scroll sideways to see every column</span>
        <button type="button" className="agent-data-action" aria-label="Scroll table left" disabled={edges.start} onClick={() => scrollRef.current?.scrollBy({ left: -260 })}><ChevronLeft aria-hidden="true" size={16} /></button>
        <button type="button" className="agent-data-action" aria-label="Scroll table right" disabled={edges.end} onClick={() => scrollRef.current?.scrollBy({ left: 260 })}><ChevronRight aria-hidden="true" size={16} /></button>
      </div>}
    </figure>
    <DialogContent className="agent-data-dialog flex w-[calc(100vw-1rem)] max-w-6xl flex-col overflow-hidden">
      <DialogTitle className="pr-8">{label}</DialogTitle>
      <DialogDescription>Scroll to explore all rows and columns. Exports keep formula-like values as text.</DialogDescription>
      <div className="agent-data-actions">{actions}</div>
      {feedback}
      <div role="region" aria-label={`Expanded ${label}`} tabIndex={0} className="agent-table-scroll agent-table-enlarged">
        <table aria-label={label}>{children}</table>
      </div>
    </DialogContent>
  </Dialog>;
}
