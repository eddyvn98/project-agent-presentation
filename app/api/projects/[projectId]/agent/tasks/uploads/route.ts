import { NextRequest } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { receiveProjectAgentUpload } from "@/lib/project-agent/input-upload-handler";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;
	return receiveProjectAgentUpload(req, params.projectId, auth.callerEmail!);
}
