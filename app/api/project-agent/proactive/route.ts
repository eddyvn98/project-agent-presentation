import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { proactiveSuggestions } from "@/lib/project-agent/proactive-suggestions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  const owner = typeof token?.email === "string" ? token.email.trim().toLowerCase() : "";
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ suggestions: await proactiveSuggestions(owner) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Suggestions unavailable" }, { status: 503 }); }
}
