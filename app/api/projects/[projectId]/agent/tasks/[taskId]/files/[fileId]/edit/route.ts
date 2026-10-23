import { NextRequest, NextResponse } from "next/server";
import { readProjectAgentFile, readProjectAgentTask } from "@/lib/project-agent/task-store";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { listProjectConversationMembers } from "@/lib/capabilities/project-sharing";
import { canAccessProjectAgentTask } from "@/lib/project-agent/access";
import { importDocxToBoard } from "@/lib/workspace/docx-import";
import { createPdfOfficeFile } from "@/lib/office/pdf-import";
import { officeEditorUrl } from "@/lib/office/catalog";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Opens a Word or PDF deliverable for editing on the web: Word becomes a document on a Workspace board owned by the caller; a PDF becomes a PDF Office file (versions kept in 360i). */
export async function POST(
	req: NextRequest,
	{ params }: { params: { projectId: string; taskId: string; fileId: string } },
) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;
	const members = await listProjectConversationMembers(params.projectId, auth.callerEmail!);
	const task = await readProjectAgentTask(params.taskId);
	if (!task || !members || !canAccessProjectAgentTask(task, params.projectId, auth.ownerEmail!, members)) {
		return NextResponse.json({ error: "Task not found" }, { status: 404 });
	}
	const file = task.files?.find((item) => item.id === params.fileId);
	if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
	const isPdf = /\.pdf$/i.test(file.name);
	if (!isPdf && !/\.docx$/i.test(file.name)) return NextResponse.json({ error: "Only .docx and .pdf files can be edited on the web" }, { status: 415 });
	const bytes = await readProjectAgentFile(task.id, file.id).catch(() => null);
	if (!bytes) return NextResponse.json({ error: "File not found" }, { status: 404 });
	try {
		if (isPdf) {
			const created = await createPdfOfficeFile(auth.callerEmail!, file.name, Buffer.from(bytes), file.id);
			return NextResponse.json({ ...created, editorUrl: created.url });
		}
		const result = await importDocxToBoard(bytes, file.name, file.id, auth.callerEmail!);
		return NextResponse.json({ ...result, editorUrl: officeEditorUrl("document", result.boardId, result.docId) });
	} catch (error) {
		return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 240) : "Could not open the file for editing" }, { status: 422 });
	}
}
