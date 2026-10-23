import { NextRequest, NextResponse } from "next/server";
import { readProjectAgentFile, readProjectAgentTask } from "@/lib/project-agent/task-store";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { listProjectConversationMembers } from "@/lib/capabilities/project-sharing";
import { canAccessProjectAgentTask } from "@/lib/project-agent/access";
import { importPptxToBoard } from "@/lib/workspace/pptx-import";
import { officeEditorUrl } from "@/lib/office/catalog";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { projectId: string; taskId: string; fileId: string } }) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;
	const members = await listProjectConversationMembers(params.projectId, auth.callerEmail!);
	const task = await readProjectAgentTask(params.taskId);
	if (!task || !members || !canAccessProjectAgentTask(task, params.projectId, auth.ownerEmail!, members)) return NextResponse.json({ error: "Task not found" }, { status: 404 });
	const file = task.files?.find((item) => item.id === params.fileId);
	if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
	if (!/\.pptx$/i.test(file.name)) return NextResponse.json({ error: "Only .pptx files can be edited on the web" }, { status: 415 });
	const bytes = await readProjectAgentFile(task.id, file.id).catch(() => null);
	if (!bytes) return NextResponse.json({ error: "File not found" }, { status: 404 });
	try {
		const result = await importPptxToBoard(bytes, file.name, file.id, auth.callerEmail!);
		return NextResponse.json({ ...result, editorUrl: officeEditorUrl("presentation", result.boardId, result.blockId) });
	} catch (error) {
		return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 240) : "Could not open the presentation for editing" }, { status: 422 });
	}
}
