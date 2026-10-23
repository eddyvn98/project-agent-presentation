"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Folder, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProjectStore, type ProjectMemoryMode } from "@/stores/useProjectStore";
import { ProjectSkillsSection } from "@/components/features/projects/ProjectSkillsSection";
import { ProjectSharingTab } from "@/components/features/projects/ProjectSharingTab";
import { clearProjectAgentView } from "@/lib/project-agent/view-session";

export interface ProjectModalProps {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  initialTab?: "details" | "knowledge" | "sharing";
}

const MEMORY_HINTS: Record<ProjectMemoryMode, string> = {
  DEFAULT: "This project can access memory from outside chats, and vice versa.",
  PROJECT_ONLY: "This project can only access its own memory. Its memory is hidden from outside chats.",
};
const fieldClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950";

export function ProjectModal({ open, onClose, projectId, initialTab }: ProjectModalProps) {
  const router = useRouter();
  const project = useProjectStore((s) => (projectId ? s.getProjectById(projectId) : null));
  const updateProject = useProjectStore((s) => s.updateProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const leaveSharedProject = useProjectStore((s) => s.leaveSharedProject);
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [memoryMode, setMemoryMode] = useState<ProjectMemoryMode>("PROJECT_ONLY");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  const sharing = initialTab === "sharing";
  const shared = Boolean(project?.sharedRole);
  const readOnly = project?.sharedRole === "CHAT";
  const canManageShares = Boolean(project && (!project.sharedRole || project.sharedRole === "EDIT"));

  useEffect(() => {
    if (!open || !project) return;
    setName(project.name);
    setInstructions(project.instructions);
    setMemoryMode(project.memoryMode ?? "PROJECT_ONLY");
    setConfirmDelete(false);
    setError("");
    // Reload the form only when the dialog opens for a project, not on every store update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const save = async () => {
    const trimmed = name.trim();
    if (!projectId || !trimmed || saving) return;
    setSaving(true);
    try {
      await updateProject(projectId, { name: trimmed, instructions: instructions.trim(), ...(shared ? {} : { memoryMode }) });
      onClose();
    } catch {
      setError("Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!projectId) return;
    const wasActive = useProjectStore.getState().activeProjectId === projectId;
    setSaving(true);
    try {
      await (shared ? leaveSharedProject(projectId) : deleteProject(projectId));
      onClose();
      if (!wasActive) return;
      clearProjectAgentView(projectId);
      router.push("/projects");
    } catch {
      setError(shared ? "Could not leave project" : "Could not delete project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="bg-white sm:max-w-[520px] dark:bg-slate-900">
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-white">{sharing ? "Share project" : "Project settings"}</DialogTitle>
        </DialogHeader>

        {sharing ? (
          <div className="max-h-[60vh] overflow-y-auto">{projectId && canManageShares ? <ProjectSharingTab projectId={projectId} isOwner={!shared} /> : null}</div>
        ) : project ? (
          <div className="flex flex-col gap-4">
          <div className="flex max-h-[52vh] flex-col gap-5 overflow-y-auto pr-1">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">Project name
              <span className="relative block">
                <Folder className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={name} onChange={(event) => setName(event.target.value)} disabled={readOnly} className={`${fieldClass} pl-9`} />
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-800 dark:text-slate-100">Instructions
              <span className="text-xs font-normal text-slate-500">Set context and customize how the agent responds in this project.</span>
              <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} disabled={readOnly} rows={4} placeholder="e.g. Respond in Spanish. Keep answers short and focused." className={`${fieldClass} mt-1 resize-none`} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">Memory
              <select value={shared || project.hasShared ? "PROJECT_ONLY" : memoryMode} onChange={(event) => setMemoryMode(event.target.value as ProjectMemoryMode)} disabled={shared || Boolean(project.hasShared) || readOnly} className={fieldClass}>
                <option value="DEFAULT">Default</option>
                <option value="PROJECT_ONLY">Project-only</option>
              </select>
              <span className="text-xs font-normal text-slate-500">{shared || project.hasShared ? "Shared projects always use project-only memory." : MEMORY_HINTS[memoryMode]}</span>
            </label>
            <div className="-mx-1"><ProjectSkillsSection projectId={project.id} skillIds={project.skillIds ?? []} canEdit={!readOnly} onManage={onClose} /></div>
          </div>
            {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
            <div className="flex items-center justify-between gap-3">
              {confirmDelete ? (
                <span className="flex items-center gap-2 text-sm">
                  <button type="button" onClick={() => void remove()} disabled={saving} className="rounded-full bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50">{shared ? "Confirm leave" : "Confirm delete"}</button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-full px-3 py-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-full bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 dark:bg-red-950/30">{shared ? "Leave project" : "Delete project"}</button>
              )}
              {!readOnly ? <button type="button" onClick={() => void save()} disabled={saving || !name.trim()} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save</button> : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
