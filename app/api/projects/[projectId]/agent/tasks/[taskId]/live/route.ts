import { NextRequest, NextResponse } from "next/server";
import { authorizeTaskAccess, sandboxKeyOf } from "@/lib/project-agent/live-preview/access";
import { listLivePreviews } from "@/lib/project-agent/live-preview/registry";
import { signLiveToken } from "@/lib/project-agent/live-preview/token";

export const runtime = "nodejs";

/** Servers the agent started in this task's sandbox, each with a link that opens it in a sandboxed frame. */
export async function GET(req: NextRequest, { params }: { params: { projectId: string; taskId: string } }) {
	const access = await authorizeTaskAccess(req, params.projectId, params.taskId);
	if (access.response) return access.response;
	const previews = await listLivePreviews(sandboxKeyOf(access.task!));
	return NextResponse.json({
		previews: previews.map((preview) => ({
			...preview,
			url: `/api/projects/${encodeURIComponent(params.projectId)}/agent/tasks/${encodeURIComponent(params.taskId)}/live/${signLiveToken(params.projectId, params.taskId, preview.port)}/${preview.port}/`,
		})),
	}, { headers: { "Cache-Control": "private, no-store" } });
}
