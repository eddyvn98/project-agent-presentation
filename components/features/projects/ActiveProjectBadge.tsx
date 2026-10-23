"use client";

import { X } from "lucide-react";
import { useProjectStore } from "@/stores/useProjectStore";

export function ActiveProjectBadge() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const getActiveProject = useProjectStore((s) => s.getActiveProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  const project = activeProjectId ? getActiveProject() : null;
  if (!project) return null;

  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-l-full rounded-r-none border border-r-0 text-[11px] font-medium max-w-[240px]"
        style={{
          borderColor: `${project.color}55`,
          backgroundColor: `${project.color}18`,
          color: project.color,
        }}
      >
        <span className="flex-shrink-0 text-sm leading-none">{project.icon}</span>
        <span className="truncate">{project.name}</span>
      </div>

      <button
        type="button"
        onClick={() => setActiveProject(null)}
        className="flex items-center justify-center w-6 h-[26px] rounded-l-none rounded-r-full border border-l-0 transition-all duration-150 hover:opacity-90"
        style={{
          borderColor: `${project.color}55`,
          backgroundColor: `${project.color}18`,
          color: project.color,
        }}
        aria-label="Clear active project"
        title="Clear active project"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}
