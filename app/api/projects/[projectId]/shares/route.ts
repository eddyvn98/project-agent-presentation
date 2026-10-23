import { ProjectShareRole } from "@prisma/client";
import { requireModuleAccess } from "@/app/api/aidt-access/_module-guard";
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { inviteProjectShare, listProjectShares } from "@/lib/capabilities/project";

export const runtime = "nodejs";

async function getEmail(req: NextRequest): Promise<string | null> {
	const token = await getToken({ req });
	return token?.email ?? (process.env.NODE_ENV !== "production" ? "user@company.com" : null);
}

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
	const denied = await requireModuleAccess(req, "assistant");
	if (denied) return denied;
	const email = await getEmail(req);
	if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	const result = await listProjectShares(params.projectId, email);
	if (!result.ok) return NextResponse.json({ error: result.reason === "FORBIDDEN" ? "Edit access is required" : "Project not found" }, { status: result.reason === "FORBIDDEN" ? 403 : 404 });
	return NextResponse.json({ shares: result.shares });
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
	const denied = await requireModuleAccess(req, "assistant");
	if (denied) return denied;
	const email = await getEmail(req);
	if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	const body = await req.json().catch(() => ({}));
	if (typeof body.email !== "string" || ![ProjectShareRole.CHAT, ProjectShareRole.EDIT].includes(body.role)) {
		return NextResponse.json({ error: "A valid email and CHAT or EDIT role are required" }, { status: 400 });
	}
	try {
		const share = await inviteProjectShare(params.projectId, email, body.email, body.role);
		if (!share) return NextResponse.json({ error: "Project not found" }, { status: 404 });
		return NextResponse.json({ share }, { status: 201 });
	} catch (cause) {
		return NextResponse.json({ error: cause instanceof Error ? cause.message : "Could not share project" }, { status: 400 });
	}
}
