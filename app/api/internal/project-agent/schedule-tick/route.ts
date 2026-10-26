import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { tickAutoSkillJobs } from "@/lib/project-agent/auto-skills/worker";
import { migrateLegacyTaskQueue } from "@/lib/project-agent/durable-queue-migration";
import { migrateLegacyScheduleFiles } from "@/lib/project-agent/scheduled-migration";
import { dispatchDueSchedules } from "@/lib/project-agent/scheduled-worker";
import { migrateProactiveInsightHistory } from "@/lib/project-agent/proactive-migration";
import { discoverProactiveOpportunities } from "@/lib/project-agent/proactive-store";
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
    const migration = process.env.PROJECT_AGENT_MIGRATE_FILE_SCHEDULES === "1"
      ? await migrateLegacyScheduleFiles() : undefined;
    const queueMigration = process.env.PROJECT_AGENT_MIGRATE_FILE_QUEUE === "1"
      ? await migrateLegacyTaskQueue() : undefined;
    const signalMigration = process.env.PROJECT_AGENT_MIGRATE_INSIGHT_HISTORY === "1"
      ? await migrateProactiveInsightHistory() : undefined;
    const result = await dispatchDueSchedules();
    const queue = await tickDurableTasks();
    const autoSkills = await tickAutoSkillJobs().catch(() => ({ attempted: 0, ready: 0 }));
    const workflows = await tickWorkflowRuns();
    const proactive = await discoverProactiveOpportunities().catch(() => null);
    return NextResponse.json({ dispatched: result.filter(r => r.status === "dispatched").length,
      attempted: result.length, queue, autoSkills, workflows, proactive, ...(migration ? { migration } : {}), ...(queueMigration ? { queueMigration } : {}), ...(signalMigration ? { signalMigration } : {}) });
  } catch { return NextResponse.json({ error: "Scheduler unavailable" }, { status: 503 }); }
}
