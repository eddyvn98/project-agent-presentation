import { createProjectAgentTask, readProjectAgentTask } from "./task-store";
import { createHash } from "node:crypto";
import { recoverProjectAgentTask } from "./task-recovery";
import { startProjectAgentTask } from "./task-runner";
import { claimScheduleRun, listDueSchedules, markScheduleRun, getSchedule, listSchedulesNeedingReconciliation, withSchedulerTickLease } from "./scheduled-store";
import type { ScheduledAgentTask } from "./scheduled-types";
import * as projectCap from "@/lib/capabilities/project";

async function reconcile(item: ScheduledAgentTask) {
  for (const run of item.runs.filter(r => r.status === "queued" || r.status === "running")) {
    if (!run.taskId) continue;
    let task = await readProjectAgentTask(run.taskId);
    if (!task) continue;
    if (task.status === "queued" || task.status === "running") {
      // Don't commandeer live work on another instance; reclaim only stale task records.
      if (Date.now() - Date.parse(task.updatedAt) > 360_000)
        task = await recoverProjectAgentTask(task).catch(() => task);
    }
    if (task.status === "done" || task.status === "failed") {
      const digest = task.status === "done" && task.resultText
        ? createHash("sha256").update(task.resultText).digest("hex") : undefined;
      const previous = item.runs.filter(r => r.occurrence !== run.occurrence &&
        r.resultDigest).at(-1)?.resultDigest;
      await markScheduleRun(item.ownerEmail, item.id, run.occurrence, {
        status: task.status, completedAt: task.completedAt ?? new Date().toISOString(),
        ...(task.error ? { error: task.error.slice(0, 180) } : {}),
        ...(digest ? { resultDigest: digest, changed: !previous || previous !== digest } : {}),
        summary: (task.resultText || task.error || "Completed").slice(0, 180),
      });
    } else if (task.status === "running")
      await markScheduleRun(item.ownerEmail, item.id, run.occurrence, { status: "running" });
  }
}
export async function executeSchedule(item: ScheduledAgentTask, manual = false) {
  await reconcile(item);
  const claimed = await claimScheduleRun(item.ownerEmail, item.id, manual);
  if (!claimed) return { status: "skipped" as const };
  const { run } = claimed;
  try {
    const project = await projectCap.getProjectAccess(item.projectId, item.ownerEmail);
    if (!project) throw new Error("Project access has expired; scheduled work was blocked");
    const prompt = item.prompt + "\n\nThis is a previously authorized scheduled Agent run. Do not create another schedule unless the user explicitly requested it. Respect existing permission and confirmation policy.";
    const task = await createProjectAgentTask({
      projectId: item.projectId, ownerEmail: item.ownerEmail, projectOwnerEmail: project.ownerEmail,
      scheduleRunId: item.id + ":" + run.occurrence,
      prompt, userPrompt: item.prompt,
    });
    await markScheduleRun(item.ownerEmail, item.id, run.occurrence, { status: "queued", taskId: task.id });
    startProjectAgentTask(task.id);
    return { status: "dispatched" as const, taskId: task.id };
  } catch (cause) {
    await markScheduleRun(item.ownerEmail, item.id, run.occurrence, {
      status: "failed", completedAt: new Date().toISOString(),
      error: cause instanceof Error ? cause.message.slice(0, 180) : "Dispatch failed",
    });
    return { status: "failed" as const };
  }
}
export async function dispatchDueSchedules(limit = 20) {
  const claimed = await withSchedulerTickLease(async () => {
    for (const item of await listSchedulesNeedingReconciliation())
      await reconcile(item);
    const due = await listDueSchedules(Date.now(), limit);
    const out = [];
    for (const item of due) out.push({ id: item.id, ...(await executeSchedule(item)) });
    return out;
  });
  return claimed ?? [];
}
export async function runScheduleNow(owner: string, id: string) {
  const item = await getSchedule(owner, id);
  if (!item) throw new Error("Schedule not found");
  return executeSchedule(item, true);
}
