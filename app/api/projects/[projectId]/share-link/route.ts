import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { createProjectShareLink, getProjectShareLinkStatus, revokeProjectShareLink } from "@/lib/capabilities/project-share-links";

export const runtime = "nodejs";

async function authorizeOwner(req: NextRequest, projectId: string) {
	const auth = await resolveProjectRequestAccess(req, projectId, "EDIT");
	if (auth.response) return { response: auth.response, email: null };
	if (auth.access?.role !== "OWNER") return {
		response: NextResponse.json({ error: "Only the project owner can manage invite links" }, { status: 403 }),
		email: null,
	};
	return { response: null, email: auth.callerEmail! };
}

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
	const auth = await authorizeOwner(req, params.projectId);
	if (auth.response) return auth.response;
	const enabled = await getProjectShareLinkStatus(params.projectId, auth.email!);
	if (enabled === null) return NextResponse.json({ error: "Project not found" }, { status: 404 });
	return NextResponse.json({ enabled });
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
	const auth = await authorizeOwner(req, params.projectId);
	if (auth.response) return auth.response;
	const result = await createProjectShareLink(params.projectId, auth.email!);
	if (!result) return NextResponse.json({ error: "Project not found" }, { status: 404 });
	return NextResponse.json(result, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { projectId: string } }) {
	const auth = await authorizeOwner(req, params.projectId);
	if (auth.response) return auth.response;
	const revoked = await revokeProjectShareLink(params.projectId, auth.email!);
	if (!revoked) return NextResponse.json({ error: "Project not found" }, { status: 404 });
	return NextResponse.json({ ok: true });
}
