import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { dispatchDueSchedules } from "@/lib/project-agent/scheduled-worker";
import { tickDurableTasks } from "@/lib/project-agent/task-runner";
import { tickWorkflowRuns } from "@/lib/project-agent/workflow-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;
export async function POST(req: NextRequest) {
  const secret = process.env.PROJECT_AGENT_SCHEDULER_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || !header.startsWith("Bearer "))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const expected = Buffer.from(secret), given = Buffer.from(header.slice(7));
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await dispatchDueSchedules();
    const queue = await tickDurableTasks();
    const workflows = await tickWorkflowRuns();
    return NextResponse.json({ dispatched: result.filter(r => r.status === "dispatched").length,
      attempted: result.length, queue, workflows });
  } catch { return NextResponse.json({ error: "Scheduler unavailable" }, { status: 503 }); }
}
