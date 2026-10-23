import { NextRequest, NextResponse } from "next/server";
import { canAccessProjectAgentTask } from "@/lib/project-agent/access";
import { listProjectConversationMembers } from "@/lib/capabilities/project-sharing";
import { readProjectAgentTask } from "@/lib/project-agent/task-store";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";

/** The sandbox of a task is keyed like the runtime keys it: the conversation, or the task itself for a one-off. */
export const sandboxKeyOf = (task: { id: string; conversationId?: string | null }) => task.conversationId ?? task.id;

export async function authorizeTaskAccess(req: NextRequest, projectId: string, taskId: string) {
	const auth = await resolveProjectRequestAccess(req, projectId, "CHAT");
	if (auth.response) return { response: auth.response };
	const members = await listProjectConversationMembers(projectId, auth.callerEmail!);
	const task = await readProjectAgentTask(taskId);
	if (!task || !members || !canAccessProjectAgentTask(task, projectId, auth.ownerEmail!, members)) {
		return { response: NextResponse.json({ error: "Task not found" }, { status: 404 }) };
	}
	return { task };
}
