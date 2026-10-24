import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { tickHarnessLab } from "@/lib/project-agent/harness-lab/evaluate";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;
/** Dedicated model-heavy worker, isolated from the user's scheduling heartbeat. */
export async function POST(req: NextRequest) {
  const secret = process.env.PROJECT_AGENT_SCHEDULER_SECRET;
  const bearer = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || !bearer.startsWith("Bearer "))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const given = Buffer.from(bearer.slice(7)), expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ lab: await tickHarnessLab(1) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Harness evaluator unavailable" }, { status: 503 });
  }
}
