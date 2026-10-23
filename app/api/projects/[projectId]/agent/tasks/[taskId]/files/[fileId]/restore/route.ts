import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { readProjectAgentFile, readProjectAgentTask } from "@/lib/project-agent/task-store";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { listProjectConversationMembers } from "@/lib/capabilities/project-sharing";
import { canAccessProjectAgentTask } from "@/lib/project-agent/access";
import { resolveWorkspacePath } from "@/lib/project-agent/runtime/sandbox";

export const runtime = "nodejs";

/** Checkpoint restore: puts an earlier version of a deliverable back into the chat's /work/outputs, so the next message continues from it. */
export async function POST(
	req: NextRequest,
	{ params }: { params: { projectId: string; taskId: string; fileId: string } },
) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;
	const members = await listProjectConversationMembers(params.projectId, auth.callerEmail!);
	const task = await readProjectAgentTask(params.taskId);
	if (!task || !members || !canAccessProjectAgentTask(task, params.projectId, auth.ownerEmail!, members)) return NextResponse.json({ error: "Task not found" }, { status: 404 });
	const file = task.files?.find((item) => item.id === params.fileId);
	const bytes = file ? await readProjectAgentFile(task.id, file.id).catch(() => null) : null;
	if (!file || !bytes) return NextResponse.json({ error: "File not found" }, { status: 404 });
	const name = path.basename(file.name);
	const target = resolveWorkspacePath(task.conversationId ?? task.id, `outputs/${name}`);
	await fs.mkdir(path.dirname(target), { recursive: true });
	await fs.writeFile(target, bytes);
	return NextResponse.json({ restored: name, path: `/work/outputs/${name}` });
}
