import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { requireModuleAccess } from "@/app/api/aidt-access/_module-guard";
import { acceptProjectShareLink, getProjectShareLinkPreview } from "@/lib/capabilities/project-share-links";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
	const project = await getProjectShareLinkPreview(params.token);
	if (!project) return NextResponse.json({ error: "This Project invite link is invalid or has been revoked" }, { status: 404 });
	return NextResponse.json({ project });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
	const denied = await requireModuleAccess(req, "assistant");
	if (denied) return denied;
	const session = await getToken({ req });
	const email = session?.email ?? (process.env.NODE_ENV !== "production" ? "user@company.com" : null);
	if (!email) return NextResponse.json({ error: "Sign in to join this Project" }, { status: 401 });
	const result = await acceptProjectShareLink(params.token, email);
	if (!result) return NextResponse.json({ error: "This Project invite link is invalid or has been revoked" }, { status: 404 });
	return NextResponse.json(result);
}
