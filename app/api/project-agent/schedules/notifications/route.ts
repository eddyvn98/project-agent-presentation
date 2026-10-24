import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { acknowledgeScheduleRun, listSchedules } from "@/lib/project-agent/scheduled-mongo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
async function getOwner(req: NextRequest): Promise<string | null> {
  const token = await getToken({ req });
  return typeof token?.email === "string" ? token.email.trim().toLowerCase() : null;
}
export async function GET(req: NextRequest) {
  const owner = await getOwner(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: HEADERS });
  try {
    const schedules = await listSchedules(owner);
    const notifications = schedules.flatMap(schedule => schedule.runs
      .filter(run => ["done", "failed"].includes(run.status) && !run.acknowledgedAt &&
        !(schedule.spec.kind === "watch" && run.changed === false))
      .map(run => ({
        id: schedule.id, title: schedule.title, projectId: schedule.projectId,
        occurrence: run.occurrence, status: run.status,
        changed: run.changed, summary: run.summary, taskId: run.taskId,
        completedAt: run.completedAt,
      }))).sort((a,b) => (b.completedAt ?? b.occurrence).localeCompare(a.completedAt ?? a.occurrence)).slice(0,30);
    return NextResponse.json({ notifications }, { headers: HEADERS });
  } catch { return NextResponse.json({ error: "Notifications unavailable" }, { status: 503, headers: HEADERS }); }
}
export async function PATCH(req: NextRequest) {
  const owner = await getOwner(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: HEADERS });
  const origin = req.headers.get("origin");
  if (!origin || (() => { try { return new URL(origin).origin !== req.nextUrl.origin; } catch { return true; } })())
    return NextResponse.json({ error: "Origin denied" }, { status: 403, headers: HEADERS });
  const body = await req.json().catch(() => null) as { id?: unknown; occurrence?: unknown } | null;
  if (typeof body?.id !== "string" || typeof body.occurrence !== "string" || body.occurrence.length > 50)
    return NextResponse.json({ error: "Invalid notification" }, { status: 400, headers: HEADERS });
  try {
    await acknowledgeScheduleRun(owner, body.id, body.occurrence);
    return NextResponse.json({ ok: true }, { headers: HEADERS });
  } catch { return NextResponse.json({ error: "Notification unavailable" }, { status: 404, headers: HEADERS }); }
}
