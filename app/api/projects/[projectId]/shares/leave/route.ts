import { NextRequest, NextResponse } from "next/server";
import { deleteConvLink, listConvLinks } from "@/lib/capabilities/conv-links";
import { leaveSharedProject } from "@/lib/capabilities/project";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;
	const left = await leaveSharedProject(params.projectId, auth.callerEmail!);
	if (!left) return NextResponse.json({ error: "Only project collaborators can leave" }, { status: 403 });
	const links = await listConvLinks(auth.callerEmail!);
	await Promise.all(links.filter((link) => link.projectId === params.projectId)
		.map((link) => deleteConvLink(auth.callerEmail!, link.conversationId)));
	return NextResponse.json({ ok: true });
}
