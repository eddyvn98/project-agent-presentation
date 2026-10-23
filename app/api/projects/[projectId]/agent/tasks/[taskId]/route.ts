import { NextRequest, NextResponse } from "next/server";
import { readProjectAgentTask } from "@/lib/project-agent/task-store";
import { toPublicProjectAgentTaskWithFileMetadata } from "@/lib/project-agent/public-task";
import { recoverProjectAgentTask } from "@/lib/project-agent/task-recovery";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { listProjectConversationMembers } from "@/lib/capabilities/project-sharing";
import { canAccessProjectAgentTask } from "@/lib/project-agent/access";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; taskId: string } },
) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;

  let task = await readProjectAgentTask(params.taskId);
	const members = await listProjectConversationMembers(params.projectId, auth.callerEmail!);
	if (!task || !members || !canAccessProjectAgentTask(task, params.projectId, auth.ownerEmail!, members)) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  task = await recoverProjectAgentTask(task);
	return NextResponse.json({ task: await toPublicProjectAgentTaskWithFileMetadata(task, auth.callerEmail!) });
}
