"use client";

import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";
import type { ProjectAgentTaskFile } from "@/lib/project-agent/types";
import { useRef } from "react";
import { ProjectAgentFilePreview, isPreviewableFile } from "./ProjectAgentFilePreview";
import { ProjectAgentFileCard } from "./ProjectAgentFileCard";
import { ProjectAgentWordEdit } from "./ProjectAgentWordEdit";
import { ProjectAgentWorkspaceCard } from "./ProjectAgentWorkspaceCard";
import { ProjectAgentLivePreview } from "./ProjectAgentLivePreview";
import { ProjectAgentImageGallery } from "./ProjectAgentImageGallery";
import { ProjectAgentFileVersions } from "./ProjectAgentFileVersions";
import { fileVersions } from "@/lib/project-agent/file-versions";

interface Props {
	projectId: string;
	task: PublicProjectAgentTask;
	viewId?: string | null;
	busy: boolean;
	onRedo: (marked: File, instruction: string, original: ProjectAgentTaskFile) => void;
	fileHref: (task: PublicProjectAgentTask, file: ProjectAgentTaskFile) => string;
	/** The chat's tasks in order, to find earlier versions of each file. */
	chatTasks?: PublicProjectAgentTask[];
	/** Lower-case names of images already shown inside the answer text. */
	inlined?: Set<string>;
}

/** What the agent made in one turn: images inline (with mark-and-redo), other files as small download chips with a preview eye. */
export function ProjectAgentTaskFiles({ projectId, task, viewId, busy, onRedo, fileHref, chatTasks = [], inlined }: Props) {
	const files = task.files ?? [];
	const others = files.filter((file) => !file.mimeType.startsWith("image/"));
	const live = task.status === "running" || task.status === "queued";
	const sawLive = useRef(live);
	if (live) sawLive.current = true;
	const autoOpenId = sawLive.current && task.status === "done" ? others.find((file) => isPreviewableFile(file.name) && !/\.(zip|csv)$/i.test(file.name))?.id : undefined;
	const latest = chatTasks.length === 0 || chatTasks[chatTasks.length - 1]?.id === task.id;
	if (!files.length && !task.workspaceBoardId && !latest) return null;
	return <>
		{latest && <ProjectAgentLivePreview projectId={projectId} taskId={task.id} running={live} />}
		{task.workspaceBoardId && <ProjectAgentWorkspaceCard boardId={task.workspaceBoardId} refreshKey={`${task.status}:${task.updatedAt}`} />}
		<ProjectAgentImageGallery files={inlined?.size ? files.filter((file) => !inlined.has(file.name.toLowerCase())) : files} disabled={busy} onRedo={onRedo} fileUrl={(file) => fileHref(task, file)} />
		{others.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{others.map((file) => isPreviewableFile(file.name)
			? <ProjectAgentFilePreview key={file.id} projectId={projectId} taskId={task.id} file={file} conversationId={task.conversationId ?? viewId ?? undefined} persistInConversation autoOpen={file.id === autoOpenId} renderTrigger={(open) => <ProjectAgentFileCard file={file} href={fileHref(task, file)} onOpen={open} extra={task.canContinue && /\.docx$/i.test(file.name) ? <ProjectAgentWordEdit projectId={projectId} taskId={task.id} file={file} /> : undefined} />} />
			: <ProjectAgentFileCard key={file.id} file={file} href={fileHref(task, file)} />)}</div>}
		{task.status === "done" && task.canContinue && others.map((file) => <ProjectAgentFileVersions key={`versions-${file.id}`} projectId={projectId} versions={fileVersions(chatTasks, file.name)} currentTaskId={task.id} fileHref={fileHref} />)}
	</>;
}
