import { ProjectShareRole } from "@prisma/client";
import { requireModuleAccess } from "@/app/api/aidt-access/_module-guard";
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { revokeProjectShare, updateProjectShare } from "@/lib/capabilities/project";

export const runtime = "nodejs";

async function getEmail(req: NextRequest): Promise<string | null> {
	const token = await getToken({ req });
	return token?.email ?? (process.env.NODE_ENV !== "production" ? "user@company.com" : null);
}

async function authorize(req: NextRequest) {
	const denied = await requireModuleAccess(req, "assistant");
	if (denied) return { response: denied, email: null };
	const email = await getEmail(req);
	return email
		? { response: null, email }
		: { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), email: null };
}

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; shareId: string } }) {
	const auth = await authorize(req);
	if (auth.response) return auth.response;
	const body = await req.json().catch(() => ({}));
	if (![ProjectShareRole.CHAT, ProjectShareRole.EDIT].includes(body.role)) {
		return NextResponse.json({ error: "Role must be CHAT or EDIT" }, { status: 400 });
	}
	const result = await updateProjectShare(params.projectId, auth.email!, params.shareId, body.role);
	if (!result) return NextResponse.json({ error: "Project not found" }, { status: 404 });
	if (result.count === 0) return NextResponse.json({ error: "Collaborator not found" }, { status: 404 });
	return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { projectId: string; shareId: string } }) {
	const auth = await authorize(req);
	if (auth.response) return auth.response;
	const result = await revokeProjectShare(params.projectId, auth.email!, params.shareId);
	if (!result) return NextResponse.json({ error: "Project not found" }, { status: 404 });
	return NextResponse.json({ ok: true });
}
