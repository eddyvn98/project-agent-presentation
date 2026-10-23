import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import * as projectCap from "@/lib/capabilities/project";
import { describeImage } from "@/lib/describe-image";
import { extractTextFromBuffer } from "@/lib/extract-knowledge";
import { indexProjectKnowledge } from "@/lib/vector-store";
import { readProjectAgentFile, readProjectAgentTask, updateProjectAgentTask } from "@/lib/project-agent/task-store";
import type { ProjectAgentTaskFile } from "@/lib/project-agent/types";
import type { KnowledgeFile } from "@/stores/useProjectStore";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { listProjectConversationMembers } from "@/lib/capabilities/project-sharing";
import { canAccessProjectAgentTask } from "@/lib/project-agent/access";
import { inferProjectAgentFileMetadata } from "@/lib/project-agent/files";

export const runtime = "nodejs";
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function savedFileId(taskId: string, fileId: string): string {
	return `kf_${createHash("sha256").update(`${taskId}:${fileId}`).digest("hex").slice(0, 7)}`;
}

export async function POST(
	req: NextRequest,
	{ params }: { params: { projectId: string; taskId: string; fileId: string } },
) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "EDIT");
	if (auth.response) return auth.response;
	const ownerEmail = auth.ownerEmail!;
	const members = await listProjectConversationMembers(params.projectId, auth.callerEmail!);
	const task = await readProjectAgentTask(params.taskId);
	if (!task || !members || !canAccessProjectAgentTask(task, params.projectId, ownerEmail, members)) {
		return NextResponse.json({ error: "Task not found" }, { status: 404 });
	}
	const file = task.files?.find((item) => item.id === params.fileId);
	if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
	if (task.status !== "done") return NextResponse.json({ error: "This draft has not passed the Project Agent review" }, { status: 409 });
	if (file.savedToProjectFileId) return NextResponse.json({ fileId: file.savedToProjectFileId });
	if (task.filesExpireAt && Date.parse(task.filesExpireAt) <= Date.now()) {
		return NextResponse.json({ error: "File link expired; only files saved to the Project remain available" }, { status: 410 });
	}
	const bytes = await readProjectAgentFile(task.id, file.id).catch(() => null);
	if (!bytes) return NextResponse.json({ error: "Generated file is no longer available" }, { status: 410 });
	if (bytes.byteLength > MAX_FILE_BYTES) return NextResponse.json({ error: "Generated file exceeds the 20 MiB Project limit" }, { status: 413 });
	const normalizedFile = { ...file, ...inferProjectAgentFileMetadata(file.name, file.mimeType, bytes), size: bytes.byteLength };

	try {
		const { text, fileType, sections } = await extractTextFromBuffer(bytes, normalizedFile.mimeType, normalizedFile.name);
		const id = savedFileId(task.id, file.id);
		const knowledgeFile: KnowledgeFile = {
			id,
			projectId: params.projectId,
			name: normalizedFile.name,
			mimeType: normalizedFile.mimeType,
			fileType,
			sizeBytes: bytes.byteLength,
			status: "ready",
			uploadedAt: Date.now(),
		};
		const description = fileType === "image"
			? await describeImage(bytes, normalizedFile.mimeType, normalizedFile.name, auth.callerEmail!).catch(() => "")
			: sections ?? text;
		const saved = await projectCap.withOwnerLock(ownerEmail, async () => {
			const current = await projectCap.getProject(params.projectId, ownerEmail);
			if (!current.ok || !current.data) return current;
			if (current.data.knowledgeFiles.some((item) => item.id === id)) return current;
			if (fileType === "image") await projectCap.saveKnowledgeImage(id, bytes, file.mimeType);
			return projectCap.addKnowledgeFile(
				params.projectId,
				ownerEmail,
				knowledgeFile,
				description || undefined,
				fileType === "text" ? bytes : undefined,
			);
		});
		if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 });
		const nextFiles: ProjectAgentTaskFile[] = task.files!.map((item) => item.id === file.id
			? { ...item, ...normalizedFile, savedToProjectFileId: id, savedAt: new Date().toISOString() }
			: item);
		await updateProjectAgentTask(task.id, { files: nextFiles });
		indexProjectKnowledge(params.projectId, ownerEmail).catch(() => {});
		return NextResponse.json({ fileId: id });
	} catch (error) {
		if (error instanceof Error && (error as NodeJS.ErrnoException).code === "UNSUPPORTED_TYPE") {
			return NextResponse.json({ error: error.message }, { status: 415 });
		}
		console.error("[project agent save file] error:", error);
		return NextResponse.json({ error: "Could not save generated file to Project" }, { status: 500 });
	}
}
