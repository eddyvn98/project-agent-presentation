import { getMongoAiDb } from "@/services/mongodb/client";
import { readProjectAgentTask } from "./task-store";
import { claimCompaction, finishCompaction, releaseCompaction,
  COMPACTION_LEASE_COLLECTION } from "./compact-lease-core.mjs";
import type { ProjectAgentTask } from "./types";

/** Fail closed if Mongo unavailable, task stopped or an older worker tries to publish. */
export async function withCompactionLease(
  task: Pick<ProjectAgentTask, "id" | "projectId" | "ownerEmail" | "conversationId">,
  sourceTaskId: string, compact: () => Promise<string | undefined>,
): Promise<string | undefined> {
  if (!task.conversationId) return undefined;
  const scope = { projectId: task.projectId, ownerEmail: task.ownerEmail,
    conversationId: task.conversationId };
  const db = await getMongoAiDb();
  const collection = db.collection(COMPACTION_LEASE_COLLECTION);
  const claim = await claimCompaction(collection, scope, sourceTaskId);
  if (!claim) return undefined;
  try {
    const active = await readProjectAgentTask(task.id);
    if (!active || active.projectId !== task.projectId ||
        active.ownerEmail !== task.ownerEmail || active.cancelled ||
        active.status !== "running") return undefined;
    const modelId = await compact();
    const latest = await readProjectAgentTask(task.id);
    if (!modelId || !latest || latest.cancelled || latest.status !== "running") return undefined;
    if (!await finishCompaction(collection, claim, modelId)) return undefined;
    return modelId;
  } finally {
    await releaseCompaction(collection, claim);
  }
}
