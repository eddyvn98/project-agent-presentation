import { NextRequest, NextResponse } from "next/server";
import { readProjectAgentTask, readProjectAgentTaskInputFile } from "@/lib/project-agent/task-store";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { listProjectConversationMembers } from "@/lib/capabilities/project-sharing";
import { canAccessProjectAgentTask } from "@/lib/project-agent/access";

export const runtime = "nodejs";

const INLINE_IMAGES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

// GET /api/projects/:projectId/agent/tasks/:taskId/attachments/:fileId — a file the user attached to that message
export async function GET(req: NextRequest, { params }: { params: { projectId: string; taskId: string; fileId: string } }) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;
	const members = await listProjectConversationMembers(params.projectId, auth.callerEmail!);
	const task = await readProjectAgentTask(params.taskId);
	if (!task || !members || !canAccessProjectAgentTask(task, params.projectId, auth.ownerEmail!, members)) {
		return NextResponse.json({ error: "Task not found" }, { status: 404 });
	}
	const file = task.inputFiles?.find((item) => item.id === params.fileId);
	const bytes = file ? await readProjectAgentTaskInputFile(task.id, file.id).catch(() => null) : null;
	if (!file || !bytes) return NextResponse.json({ error: "File not found" }, { status: 404 });
	const image = INLINE_IMAGES.has(file.mimeType);
	return new NextResponse(new Uint8Array(bytes), {
		headers: {
			"Content-Type": image ? file.mimeType : "application/octet-stream",
			"Content-Disposition": `${image ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
			"Cache-Control": "private, max-age=3600",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
