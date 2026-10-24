import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { proactiveSuggestions } from "@/lib/project-agent/proactive-suggestions";
import { saveProactiveOpportunities, listProactiveOpportunities, changeProactiveOpportunity } from "@/lib/project-agent/proactive-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  const owner = typeof token?.email === "string" ? token.email.trim().toLowerCase() : "";
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await saveProactiveOpportunities(owner, await proactiveSuggestions(owner));
    return NextResponse.json({ suggestions: await listProactiveOpportunities(owner) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Suggestions unavailable" }, { status: 503 }); }
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  const owner = typeof token?.email === "string" ? token.email.trim().toLowerCase() : "";
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const origin = req.headers.get("origin");
  if (!origin || (() => { try { return new URL(origin).origin !== req.nextUrl.origin; } catch { return true; } })())
    return NextResponse.json({ error: "Origin denied" }, { status: 403 });
  const body = await req.json().catch(() => null) as { id?: unknown; action?: unknown } | null;
  if (typeof body?.id !== "string" || !["dismiss","snooze"].includes(String(body.action)))
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  try {
    await changeProactiveOpportunity(owner, body.id, body.action as "dismiss" | "snooze");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Unknown suggestion" }, { status: 404 }); }
}
