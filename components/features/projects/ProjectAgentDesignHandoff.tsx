"use client";

import { Download, FileBox, FileText, Pencil, ScanEye } from "lucide-react";
import { useState } from "react";
import { ProjectAgentDesignEditor } from "./ProjectAgentDesignEditor";
import { ProjectAgentDesignApproval } from "./ProjectAgentDesignApproval";
import type { ProjectAgentTaskFile } from "@/lib/project-agent/types";
import type { DesignHandoff } from "@/lib/project-agent/design-handoff";
import { makeDesignEditPrompt } from "@/lib/project-agent/design-handoff";

type Props = {
  design: DesignHandoff;
  fileHref: (file: ProjectAgentTaskFile) => string;
  onPreview: (file: ProjectAgentTaskFile) => void;
  onEdit?: (prompt: string) => void;
  projectId?: string;
  taskId?: string;
};

/** A single phone-sized handoff replaces the scattered CAD/BIM file chips for one revision. */
export function ProjectAgentDesignHandoff({ design, fileHref, onPreview, onEdit, projectId, taskId }: Props) {
  const [editing, setEditing] = useState(false);
  const prompt = makeDesignEditPrompt(design.source.name);
  const downloads = [
    { file: design.dxf, label: "CAD · DXF" },
    ...(design.ifc ? [{ file: design.ifc, label: "Revit · IFC" }] : []),
    { file: design.glb, label: "3D · GLB" },
    { file: design.pdf, label: "Drawing · PDF" },
    { file: design.source, label: "Source · JSON" },
  ];
  return <section aria-label={`Design handoff ${design.id}`}
    className="my-3 w-full min-w-0 overflow-clip rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
    <header className="flex items-start gap-3 px-4 py-3">
      <FileBox className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">AI-generated interior concept · human review required</h3>
        <p className="mt-1 text-xs text-slate-500">AI creates and proposes changes. Review geometry and dimensions before authorizing a revision.</p>
      </div>
      <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-950 dark:text-amber-300">Concept</span>
    </header>
    {design.preview ? <button type="button" onClick={() => onPreview(design.preview!)}
      aria-label="Preview design image" className="block w-full bg-slate-100 dark:bg-slate-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img loading="lazy" src={fileHref(design.preview) + "?preview=1"} alt="2D plan and 3D concept preview"
        className="aspect-video w-full object-contain" />
    </button> : null}
    <div className="grid grid-cols-2 gap-2 p-3">
      <button type="button" onClick={() => onPreview(design.pdf)}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-medium dark:border-slate-700">
        <FileText className="h-4 w-4" /> View PDF
      </button>
      {design.viewer ? <button type="button" onClick={() => onPreview(design.viewer!)}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-medium dark:border-slate-700">
        <ScanEye className="h-4 w-4" /> View 3D
      </button> : <a href={fileHref(design.glb)} download={design.glb.name}
        className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-medium dark:border-slate-700">
        Download GLB
      </a>}
      {prompt && onEdit ? <>
        <button type="button" onClick={() => setEditing((v) => !v)} aria-expanded={editing}
          className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3 text-sm font-semibold text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200">
          <Pencil className="h-4 w-4" /> {editing ? "Close floor plan editor" : "Edit on floor plan"}
        </button>
        <button type="button" onClick={() => onEdit(prompt)}
          className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
          <Pencil className="h-4 w-4" /> Request a change
        </button>
      </> : null}
    </div>
    {editing && prompt && onEdit && <ProjectAgentDesignEditor
      sourceUrl={fileHref(design.source)} sourceName={design.source.name}
      onEdit={onEdit} onClose={() => setEditing(false)} />}
    {projectId && taskId && <ProjectAgentDesignApproval projectId={projectId} taskId={taskId}
      sourceFileId={design.source.id} />}
    <div className="border-t border-slate-100 px-3 pb-3 pt-2 dark:border-slate-800">
      <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Download for desktop</p>
      <div className="flex flex-wrap gap-2">
        {downloads.map(({ file, label }) => <a key={file.id} href={fileHref(file)} download={file.name}
          aria-label={`Download ${label}`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
          <Download className="h-3.5 w-3.5" />{label}
        </a>)}
      </div>
      {!design.ifc && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
        IFC unavailable for this revision; DXF and GLB remain downloadable.
      </p>}
      <p className="mt-2 text-[11px] text-slate-500">Verify measurements before construction. IFC is not native RVT.</p>
    </div>
  </section>;
}
