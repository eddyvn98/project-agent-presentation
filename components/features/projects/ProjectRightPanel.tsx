"use client";

import { useProjectStore } from "@/stores/useProjectStore";
import { ProjectFilesSection } from "./ProjectFilesSection";
import { ProjectInstructionsSection } from "./ProjectInstructionsSection";
import { ProjectMemorySection } from "./ProjectMemorySection";

export function ProjectRightPanel() {
	const activeProjectId = useProjectStore((state) => state.activeProjectId);
	const project = useProjectStore((state) => state.getActiveProject());
	const files = useProjectStore((state) => state.getActiveKnowledgeFiles());
	const memoryText = useProjectStore((state) => state.getActiveMemoryContext());
	if (!activeProjectId || !project) return null;

	const canEdit = project.sharedRole !== "CHAT";
	return <aside className="hidden xl:flex flex-col w-[260px] shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0f1117] overflow-y-auto">
		<ProjectMemorySection memoryText={memoryText} memoryMode={project.memoryMode} />
		<ProjectInstructionsSection projectId={activeProjectId} instructions={project.instructions} canEdit={canEdit} />
		<ProjectFilesSection projectId={activeProjectId} files={files} canEdit={canEdit} />
	</aside>;
}
