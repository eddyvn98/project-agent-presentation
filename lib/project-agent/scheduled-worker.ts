import { createProjectAgentTask, readProjectAgentTask } from "./task-store";
import { startProjectAgentTask } from "./task-runner";
import { claimScheduleRun, listDueSchedules, markScheduleRun, getSchedule } from "./scheduled-store";
import type { ScheduledAgentTask } from "./scheduled-types";
import * as projectCap from "@/lib/capabilities/project";

async function reconcile(item: ScheduledAgentTask) {
  for (const run of item.runs.filter(r => r.status === "queued" || r.status === "running")) {
    if (!run.taskId) continue;
    const task = await readProjectAgentTask(run.taskId);
    if (!task) continue;
    if (task.status === "done" || task.status === "failed")
      await markScheduleRun(item.ownerEmail, item.id, run.occurrence, {
        status: task.status, completedAt: task.completedAt ?? new Date().toISOString(),
        ...(task.error ? { error: task.error.slice(0, 180) } : {}),
      });
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
  const due = await listDueSchedules(Date.now(), limit);
  const out = [];
  for (const item of due) out.push({ id: item.id, ...(await executeSchedule(item)) });
  return out;
}
export async function runScheduleNow(owner: string, id: string) {
  const item = await getSchedule(owner, id);
  if (!item) throw new Error("Schedule not found");
  return executeSchedule(item, true);
}
