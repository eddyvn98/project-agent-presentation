import { getMongoAiDb } from "@/services/mongodb/client";
import { assertActiveTaskLease } from "./lease-fence";
import type { ProjectAgentTask } from "./types";

type TerminalStatus = "done" | "failed";
/** Mongo task repository stores string _id in project_agent_tasks. */
export const PROJECT_AGENT_TASKS_COLLECTION = "project_agent_tasks";

/**
 * Finalize only an active, uncancelled task. Stop's terminal write wins over
 * stale model completions; a lease-lost worker must not publish results.
 */
export async function commitTaskTerminalIfActive(
  task: Pick<ProjectAgentTask, "id" | "projectId" | "ownerEmail">,
  status: TerminalStatus,
  fields: Partial<ProjectAgentTask> & { logLine?: string },
): Promise<boolean> {
  if (!/^pat_[a-f0-9]{12}$/.test(task.id)) throw new Error("Invalid terminal task id");
  if (fields.status && fields.status !== status) throw new Error("Terminal status mismatch");
  try { await assertActiveTaskLease(); }
  catch (error) {
    if (error instanceof Error && /MongoDB task lease expired or changed/.test(error.message))
      return false;
    throw error;
  }
  const db = await getMongoAiDb(), now = new Date().toISOString();
  const { logLine, status: _ignored, ...patch } = fields;
  const result = await db.collection(PROJECT_AGENT_TASKS_COLLECTION).updateOne({
    _id: task.id, projectId: task.projectId, ownerEmail: task.ownerEmail,
    status: status === "failed" ? { $in: ["queued", "running"] } : "running",
    cancelled: { $ne: true },
  }, {
    $set: { ...patch, status, updatedAt: now, completedAt: patch.completedAt ?? now },
    ...(logLine ? { $push: { log: `${now} ${logLine}` } } : {}),
  });
  return result.modifiedCount === 1;
}

/** Stop and model completion compete on the SAME Mongo task record. */
export async function stopTaskIfActive(
  task: Pick<ProjectAgentTask, "id" | "projectId" | "ownerEmail">,
): Promise<boolean> {
  if (!/^pat_[a-f0-9]{12}$/.test(task.id)) throw new Error("Invalid Stop task id");
  const db = await getMongoAiDb(), now = new Date().toISOString();
  const result = await db.collection(PROJECT_AGENT_TASKS_COLLECTION).updateOne({
    _id: task.id, projectId: task.projectId, ownerEmail: task.ownerEmail,
    status: { $in: ["queued", "running"] }, cancelled: { $ne: true },
  }, {
    $set: { status: "failed", cancelled: true, completedAt: now, updatedAt: now,
      error: "Stopped by you." },
    $push: { log: `${now} stopped by user` },
  });
  return result.modifiedCount === 1;
}
