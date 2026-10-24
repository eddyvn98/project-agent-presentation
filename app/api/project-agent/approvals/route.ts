import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { decideAgentApproval, listAgentApprovals } from "@/lib/project-agent/agent-approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store" };
async function owner(req: NextRequest) {
  const token = await getToken({ req });
  return typeof token?.email === "string" ? token.email.toLowerCase().trim() : "";
}
export async function GET(req: NextRequest) {
  const email = await owner(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: HEADERS });
  try { return NextResponse.json({ approvals: (await listAgentApprovals(email)).slice(0, 100) }, { headers: HEADERS }); }
  catch { return NextResponse.json({ error: "Approvals unavailable" }, { status: 503, headers: HEADERS }); }
}
export async function PATCH(req: NextRequest) {
  const email = await owner(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: HEADERS });
  const origin = req.headers.get("origin");
  if (!origin || (() => { try { return new URL(origin).origin !== req.nextUrl.origin; } catch { return true; } })())
    return NextResponse.json({ error: "Origin denied" }, { status: 403, headers: HEADERS });
  const body = await req.json().catch(() => null) as { id?: unknown; approve?: unknown } | null;
  if (typeof body?.id !== "string" || typeof body.approve !== "boolean")
    return NextResponse.json({ error: "Invalid decision" }, { status: 400, headers: HEADERS });
  try { return NextResponse.json({ approval: await decideAgentApproval(email, body.id, body.approve) }, { headers: HEADERS }); }
  catch { return NextResponse.json({ error: "Approval expired or unavailable" }, { status: 409, headers: HEADERS }); }
}
