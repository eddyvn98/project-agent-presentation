import { NextRequest, NextResponse } from "next/server";
import { resolveCategoryProvider } from "@/app/config/categoryProviderResolver";
import { findVisibleProjectConversation } from "@/lib/projects/shared-conversations";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";

export const runtime = "nodejs";

const AGENT_API_BASE = (process.env.PROJECT_AGENT_DIFY_API_BASE ?? "http://localhost/v1");

export async function GET(
	req: NextRequest,
	{ params }: { params: { projectId: string; conversationId: string } },
) {
	const access = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (access.response) return access.response;
	const link = await findVisibleProjectConversation(params.projectId, params.conversationId, access.callerEmail!);
	if (!link) return NextResponse.json({ error: "Project chat not found" }, { status: 404 });
	const { apiKey } = resolveCategoryProvider("CHAT_KEY");
	if (!apiKey) return NextResponse.json({ error: "Chat provider is not configured" }, { status: 503 });

	const url = new URL(`${AGENT_API_BASE}/messages`);
	url.searchParams.set("conversation_id", link.conversationId);
	url.searchParams.set("user", link.createdByEmail);
	url.searchParams.set("limit", "100");
	const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" });
	if (!response.ok) return NextResponse.json({ error: "Could not load this Project chat" }, { status: response.status });
	return NextResponse.json(await response.json());
}
