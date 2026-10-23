import { NextRequest, NextResponse } from "next/server";
import { readProjectAgentTask } from "@/lib/project-agent/task-store";
import { compactChat } from "@/lib/project-agent/compact";
import { toPublicProjectAgentTask } from "@/lib/project-agent/public-task";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";

export const runtime = "nodejs";
export const maxDuration = 130;

// POST /api/projects/:projectId/agent/compact { taskId } -> { task } a "compacted" entry in the same chat
export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;
	const { taskId } = await req.json().catch(() => ({})) as { taskId?: string };
	const task = taskId ? await readProjectAgentTask(taskId) : null;
	if (!task || task.projectId !== params.projectId || task.ownerEmail.trim().toLowerCase() !== auth.callerEmail!.trim().toLowerCase() || !task.conversationId) {
		return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
	}
	try {
		return NextResponse.json({ task: toPublicProjectAgentTask(await compactChat(task)) });
	} catch (error) {
		return NextResponse.json({ error: error instanceof Error ? error.message : "Could not compact" }, { status: 502 });
	}
}
