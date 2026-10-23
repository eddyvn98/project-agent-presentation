import { NextRequest, NextResponse } from "next/server";
import { readProjectAgentTask } from "@/lib/project-agent/task-store";
import { stopProjectAgentTaskNow } from "@/lib/project-agent/task-stop";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";

export const runtime = "nodejs";

// POST /api/projects/:projectId/agent/tasks/:taskId/stop — owner only
export async function POST(req: NextRequest, { params }: { params: { projectId: string; taskId: string } }) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;
	const task = await readProjectAgentTask(params.taskId);
	if (!task || task.projectId !== params.projectId || task.ownerEmail.trim().toLowerCase() !== auth.callerEmail!.trim().toLowerCase()) {
		return NextResponse.json({ error: "Task not found" }, { status: 404 });
	}
	const outcome = await stopProjectAgentTaskNow(task);
	if (outcome === "completed") return NextResponse.json({ ok: true, status: (await readProjectAgentTask(task.id))?.status ?? task.status });
	return NextResponse.json({ ok: true });
}
