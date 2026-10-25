import { getMongoAiDb } from "@/services/mongodb/client";
import { P7_QA_PREFIX } from "./p7-qa-guard";
import type { P7RecoverTask } from "./p7-qa-recovery";

/** Match services/mongodb/projectAgentTasks.repo.ts in the AI-WEB-CHAT host. */
export const PROJECT_AGENT_TASK_COLLECTION = "project_agent_tasks" as const;

/**
 * Mongo compare-and-set: Stop updates cancelled/status on the same document,
 * so a later synthetic recovery cannot overwrite the stopped task.
 * This must use the same collection and _id as the host task repository.
 */
export async function markP7BrowserRunningIfCurrent(task: P7RecoverTask, bootId: string): Promise<boolean> {
  if (!/^pat_[a-f0-9]{12}$/.test(task.id) ||
      task.prompt !== `${P7_QA_PREFIX} browser fixture - local synthetic data only` ||
      task.cancelled || !["running", "failed"].includes(task.status) ||
      !task.ownerEmail.trim().toLowerCase().endsWith("@project-agent.test") ||
      !task.updatedAt || !Number.isFinite(Date.parse(task.updatedAt)))
    return false;
  const db = await getMongoAiDb();
  const now = new Date().toISOString();
  const result = await db.collection(PROJECT_AGENT_TASK_COLLECTION).updateOne({
    _id: task.id, projectId: task.projectId, ownerEmail: task.ownerEmail,
    prompt: task.prompt, status: task.status, cancelled: { $ne: true },
    updatedAt: task.updatedAt,
  }, {
    $set: { status: "running", bootId, updatedAt: now },
    $unset: { error: "", completedAt: "", cancelled: "" },
    $push: { log: `${now} p7_synthetic :: browser fixture restored after host restart` },
  });
  return result.matchedCount === 1;
}

/** Read-only cross-check against the host's authoritative task repository schema. */
export async function verifyP7TaskStoreMapping(task: P7RecoverTask): Promise<boolean> {
  if (!/^pat_[a-f0-9]{12}$/.test(task.id) ||
      task.prompt !== `${P7_QA_PREFIX} browser fixture - local synthetic data only` ||
      !task.ownerEmail.trim().toLowerCase().endsWith("@project-agent.test") ||
      !task.updatedAt) return false;
  const db = await getMongoAiDb();
  const doc = await db.collection(PROJECT_AGENT_TASK_COLLECTION).findOne(
    { _id: task.id },
    { projection: { _id: 1, projectId: 1, ownerEmail: 1, prompt: 1, status: 1, updatedAt: 1 } },
  );
  return doc?.projectId === task.projectId && doc?.ownerEmail === task.ownerEmail &&
    doc?.prompt === task.prompt && doc?.status === task.status &&
    doc?.updatedAt === task.updatedAt;
}
