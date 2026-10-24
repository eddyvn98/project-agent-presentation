"use client";

import { useState } from "react";
import { Eye, Monitor, X } from "lucide-react";
import type { ActivityLanguage } from "@/lib/project-agent/activity-language";
import { browserAssistText } from "@/lib/project-agent/browser-assist-labels";
import { CANVAS_LAYOUT_STYLE } from "./ProjectAgentFilePreview";
import { ProjectAgentBrowserWatch } from "./ProjectAgentBrowserWatch";

/** The browser's own session is not an iframe; this Preview is a private screenshot-and-control surface. */
export function ProjectAgentBrowserPreview({ projectId, taskId, running, language = "en" }: {
  projectId: string; taskId: string; running: boolean; language?: ActivityLanguage;
}) {
  const [open, setOpen] = useState(false);
  const ui = browserAssistText(language);
  const root = "/api/projects/" + encodeURIComponent(projectId) + "/agent/tasks/" + encodeURIComponent(taskId) + "/browser";
  async function close() {
    // Release control before hiding it. No user browser session survives a closed panel takeover.
    try {
      await fetch(root + "/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "release" }) });
      await fetch(root, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ watch: false }) });
    } catch { /* Server control auto-expires if a connection drops. */ }
    setOpen(false);
  }
  return <>
    <button type="button" onClick={() => setOpen(true)}
      className="my-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      <Eye className="h-4 w-4" />{ui.open}
    </button>
    {open && <><style>{CANVAS_LAYOUT_STYLE}</style>
      <aside data-project-agent-canvas="open" aria-label={ui.open}
        className="fixed right-0 top-12 z-[70] flex h-[calc(100dvh-3rem)] w-full flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950 md:w-[42vw]">
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
