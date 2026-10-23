import { NextRequest, NextResponse } from "next/server";
import { readProjectAgentTask, updateProjectAgentTask } from "@/lib/project-agent/task-store";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";

export const runtime = "nodejs";

// PUT /api/projects/:projectId/agent/tasks/:taskId/feedback — { feedback: "like" | "dislike" | null } (owner only)
export async function PUT(req: NextRequest, { params }: { params: { projectId: string; taskId: string } }) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;
	const body = await req.json().catch(() => ({})) as { feedback?: unknown };
	if (body.feedback !== "like" && body.feedback !== "dislike" && body.feedback !== null) {
		return NextResponse.json({ error: "feedback must be like, dislike or null" }, { status: 400 });
	}
	const task = await readProjectAgentTask(params.taskId);
	if (!task || task.projectId !== params.projectId || task.ownerEmail.trim().toLowerCase() !== auth.callerEmail!.trim().toLowerCase()) {
		return NextResponse.json({ error: "Task not found" }, { status: 404 });
	}
	await updateProjectAgentTask(task.id, { feedback: body.feedback ?? undefined });
	return NextResponse.json({ ok: true, feedback: body.feedback });
}
