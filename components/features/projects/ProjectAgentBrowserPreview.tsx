"use client";

import { useEffect, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Eye, Monitor, X } from "lucide-react";
import type { ActivityLanguage } from "@/lib/project-agent/activity-language";
import { browserAssistText } from "@/lib/project-agent/browser-assist-labels";
import { CANVAS_LAYOUT_STYLE } from "./ProjectAgentFilePreview";
import { ProjectAgentBrowserWatch } from "./ProjectAgentBrowserWatch";

const PREVIEW_OPEN_EVENT = "project-agent-browser-preview-open";

/** Browser progress stays in chat; this panel is only the page and its controls. */
export function ProjectAgentBrowserPreview({ projectId, taskId, running, language = "en" }: {
  projectId: string; taskId: string; running: boolean; language?: ActivityLanguage;
}) {
  const [open, setOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const ui = browserAssistText(language);
  const root = "/api/projects/" + encodeURIComponent(projectId) + "/agent/tasks/" + encodeURIComponent(taskId) + "/browser";
  useEffect(() => {
    const closeOther = (event: Event) => {
      if ((event as CustomEvent<{ taskId?: string }>).detail?.taskId !== taskId) setOpen(false);
    };
    window.addEventListener(PREVIEW_OPEN_EVENT, closeOther);
    return () => window.removeEventListener(PREVIEW_OPEN_EVENT, closeOther);
  }, [taskId]);
  function openPreview() {
    window.dispatchEvent(new CustomEvent(PREVIEW_OPEN_EVENT, { detail: { taskId } }));
    setOpen(true);
  }
  async function close() {
    try {
      const response = await fetch(root, { cache: "no-store" });
      const data = await response.json() as { control?: { paused?: boolean } };
      if (data.control?.paused) await fetch(root + "/control", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "release" }) });
    } catch { /* Browser control auto-expires if the connection drops. */ }
    setOpen(false);
  }
  function resizeTo(clientX: number) {
    setPanelWidth(Math.max(360, Math.min(window.innerWidth * 0.75, window.innerWidth - clientX)));
  }
  function resizeByKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const current = panelWidth ?? Math.round(window.innerWidth * 0.42);
    setPanelWidth(Math.max(360, Math.min(window.innerWidth * 0.75, current + (event.key === "ArrowLeft" ? 24 : -24))));
  }
  const panelStyle = panelWidth ? { "--browser-preview-width": `${panelWidth}px` } as CSSProperties : undefined;
  return <>
    <button type="button" aria-expanded={open} onClick={openPreview}
      className="my-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      <Eye className="h-4 w-4" />{ui.open}
    </button>
    {running && !open && <div className="hidden"><ProjectAgentBrowserWatch projectId={projectId} taskId={taskId} running language={language} /></div>}
    {open && <><style>{CANVAS_LAYOUT_STYLE}</style>
      <aside data-project-agent-canvas="open" aria-label={ui.open}
        style={panelStyle}
        className="fixed right-0 top-12 z-[70] flex h-[calc(100dvh-3rem)] w-full flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950 md:w-[var(--browser-preview-width,42vw)]">
        <button type="button" role="separator" aria-label="Resize Browser Preview" aria-orientation="vertical"
          aria-valuemin={360} aria-valuemax={Math.round(typeof window === "undefined" ? 1200 : window.innerWidth * 0.75)}
          aria-valuenow={panelWidth ?? Math.round(typeof window === "undefined" ? 672 : window.innerWidth * 0.42)}
          onKeyDown={resizeByKeyboard} onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
            event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setResizing(true);
          }} onPointerMove={(event: PointerEvent<HTMLButtonElement>) => { if (resizing) resizeTo(event.clientX); }}
          onPointerUp={() => setResizing(false)} onPointerCancel={() => setResizing(false)}
          className="absolute left-0 top-0 z-10 hidden h-full w-2 -translate-x-1/2 cursor-col-resize touch-none bg-transparent outline-none hover:bg-blue-400/50 focus-visible:bg-blue-500/60 md:block" />
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 dark:border-slate-800">
          <Monitor className="h-4 w-4 text-orange-600" />
          <strong className="min-w-0 flex-1 truncate text-sm">{ui.open}</strong>
          <button type="button" aria-label="Close Browser Preview" title="Close Browser Preview"
            onClick={() => void close()} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <ProjectAgentBrowserWatch projectId={projectId} taskId={taskId} running={running} language={language} />
        </div>
      </aside>
    </>}
  </>;
}
