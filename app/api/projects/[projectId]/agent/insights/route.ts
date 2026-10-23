import { NextRequest, NextResponse } from "next/server";
import { listProjectConversationMembers } from "@/lib/capabilities/project-sharing";
import { buildInsights, insightsMarkdown } from "@/lib/project-agent/insights";
import { listProjectAgentTasks } from "@/lib/project-agent/task-store";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";

export const runtime = "nodejs";

/** Review of this project's recent agent tasks (failures, slow or costly runs, dislikes, suggestions). ?format=md for text, ?limit=N (default 100, max 300). */
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;
	const members = await listProjectConversationMembers(params.projectId, auth.callerEmail!);
	if (!members) return NextResponse.json({ error: "Project not found" }, { status: 404 });
	const limit = Math.min(300, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 100));
	const report = buildInsights(await listProjectAgentTasks(members, params.projectId, limit));
	if (req.nextUrl.searchParams.get("format") === "md") return new NextResponse(insightsMarkdown(report), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" } });
	return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
