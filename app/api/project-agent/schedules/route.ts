import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import * as projectCap from "@/lib/capabilities/project";
import { createSchedule, listSchedules, updateSchedule } from "@/lib/project-agent/scheduled-store";
import { runScheduleNow } from "@/lib/project-agent/scheduled-worker";
import type { ScheduleCreation } from "@/lib/project-agent/scheduled-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
async function caller(req: NextRequest) {
  const token = await getToken({ req });
  return typeof token?.email === "string" ? token.email.trim().toLowerCase() : "";
}
function originOk(req: NextRequest) {
  const source = req.headers.get("origin");
  try { return !!source && new URL(source).origin === req.nextUrl.origin; }
  catch { return false; }
}
export async function GET(req: NextRequest) {
  const owner = await caller(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: HEADERS });
  try { return NextResponse.json({ schedules: await listSchedules(owner) }, { headers: HEADERS }); }
  catch { return NextResponse.json({ error: "Schedule storage unavailable" }, { status: 503, headers: HEADERS }); }
}
export async function POST(req: NextRequest) {
  const owner = await caller(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: HEADERS });
  if (!originOk(req)) return NextResponse.json({ error: "Origin denied" }, { status: 403, headers: HEADERS });
  const body = await req.json().catch(() => null) as ScheduleCreation | null;
  if (!body || typeof body.projectId !== "string") return NextResponse.json({ error: "Invalid schedule" }, { status: 400, headers: HEADERS });
  const project = await projectCap.getProjectAccess(body.projectId, owner);
  if (!project) return NextResponse.json({ error: "Project not accessible" }, { status: 403, headers: HEADERS });
  try { return NextResponse.json({ schedule: await createSchedule(owner, body) }, { status: 201, headers: HEADERS }); }
  catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Invalid schedule" }, { status: 400, headers: HEADERS }); }
}
export async function PATCH(req: NextRequest) {
  const owner = await caller(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: HEADERS });
  if (!originOk(req)) return NextResponse.json({ error: "Origin denied" }, { status: 403, headers: HEADERS });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string" || !["approve", "approve_action", "reject_action", "pause", "resume", "delete", "edit", "run"].includes(String(body.action)))
    return NextResponse.json({ error: "Invalid action" }, { status: 400, headers: HEADERS });
  try {
    if (body.action === "run") return NextResponse.json(await runScheduleNow(owner, body.id), { headers: HEADERS });
    if (body.action === "edit" && typeof body.projectId === "string") {
      if (!await projectCap.getProjectAccess(body.projectId, owner)) throw new Error("Project not accessible");
    }
    const schedule = await updateSchedule(owner, body.id, body as Parameters<typeof updateSchedule>[2]);
    return NextResponse.json({ schedule }, { headers: HEADERS });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Could not update schedule" }, { status: 409, headers: HEADERS }); }
}
