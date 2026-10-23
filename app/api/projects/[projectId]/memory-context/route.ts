import { NextRequest, NextResponse } from "next/server";
import { loadDefaultMemoryContext, loadProjectChatContext } from "@/lib/project-agent/project-chat-context";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
	const access = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (access.response) return access.response;
	const [projectChats, personalChats] = await Promise.all([
		loadProjectChatContext(params.projectId, access.callerEmail!),
		loadDefaultMemoryContext(params.projectId, access.callerEmail!),
	]);
	const context = [projectChats, personalChats].filter(Boolean).join("\n\n");
	return NextResponse.json({ context, memoryMode: access.access?.project.memoryMode ?? "PROJECT_ONLY" });
}
