import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { searchProjectChats } from "@/lib/projects/project-chat-search";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
	const access = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (access.response) return access.response;
	const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
	if (query.length < 2 || query.length > 120) {
		return NextResponse.json({ error: "Search terms must be 2 to 120 characters" }, { status: 400 });
	}
	try {
		const result = await searchProjectChats(params.projectId, access.callerEmail!, query, req.signal);
		if (!result) return NextResponse.json({ error: "Project not found" }, { status: 404 });
		return NextResponse.json(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Project chat search failed";
		const status = message.includes("not configured") ? 503 : 502;
		return NextResponse.json({ error: message }, { status });
	}
}
