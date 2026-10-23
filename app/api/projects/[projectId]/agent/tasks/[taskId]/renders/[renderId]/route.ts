import { NextRequest, NextResponse } from "next/server";
import { readProjectAgentFile, readProjectAgentTask } from "@/lib/project-agent/task-store";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { listProjectConversationMembers } from "@/lib/capabilities/project-sharing";
import { canAccessProjectAgentTask } from "@/lib/project-agent/access";
import { renderFileId } from "@/lib/project-agent/render-ids";

export const runtime = "nodejs";

/** The page-sample image the agent looked at in one render step (shown as a thumbnail in the chat). */
export async function GET(
	req: NextRequest,
	{ params }: { params: { projectId: string; taskId: string; renderId: string } },
) {
	if (!/^render-\d{1,4}$/.test(params.renderId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;
	const members = await listProjectConversationMembers(params.projectId, auth.callerEmail!);
	const task = await readProjectAgentTask(params.taskId);
	if (!task || !members || !canAccessProjectAgentTask(task, params.projectId, auth.ownerEmail!, members)) {
		return NextResponse.json({ error: "Task not found" }, { status: 404 });
	}
	const bytes = await readProjectAgentFile(task.id, renderFileId(Number(params.renderId.slice(7)))).catch(() => null);
	if (!bytes) return NextResponse.json({ error: "Not found" }, { status: 404 });
	const contentType = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg" : "image/png";
	return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": contentType, "Content-Disposition": "inline", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
