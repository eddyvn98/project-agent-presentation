import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { accountAgentObservability } from "@/lib/project-agent/agent-observability";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  const owner = typeof token?.email === "string" ? token.email.trim().toLowerCase() : "";
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ stats: await accountAgentObservability(owner) },
    { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ error: "Analytics unavailable" }, { status: 503 }); }
}
