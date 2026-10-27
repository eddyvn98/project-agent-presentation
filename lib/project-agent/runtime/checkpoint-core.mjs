import { createHash } from "node:crypto";

const MAX_ENTRIES = 16, TTL_DAYS = 7;
export const CHECKPOINT_COLLECTION = "projectAgentContextCheckpoints";
export function checkpointScopeKey(scope) {
  if (typeof scope?.projectId !== "string" || !scope.projectId.trim() ||
      typeof scope?.chatId !== "string" || !scope.chatId.trim()) {
    throw new Error("Mongo checkpoints require a Project and chat scope");
  }
  return createHash("sha256").update(scope.projectId).update("\0")
    .update(scope.chatId).digest("hex");
}
export async function appendSharedCheckpoint(collection, scope, event, now = new Date()) {
  const key = checkpointScopeKey(scope);
  if (typeof event.taskId !== "string" || !event.taskId.trim() ||
      !Number.isSafeInteger(event.step) || event.step < 0 ||
      typeof event.action !== "string" || typeof event.observation !== "string" ||
      typeof event.failed !== "boolean") throw Error("Invalid checkpoint");
  const entry = { taskId: event.taskId.slice(0, 100), step: event.step,
    action: event.action.slice(0, 50), failed: event.failed,
    observation: event.observation.slice(0, 260), at: now.toISOString() };
  const expiresAt = new Date(now.getTime() + TTL_DAYS * 86400_000);
  // The tool may have committed but its acknowledgement been lost. Replaying the
  // same task/step must not append a duplicate checkpoint after worker recovery.
  const filter = { _id: key, projectId: scope.projectId, chatId: scope.chatId,
    entries: { $not: { $elemMatch: { taskId: entry.taskId, step: entry.step } } } };
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const updated = await collection.updateOne(filter, {
        $setOnInsert: { projectId: scope.projectId, chatId: scope.chatId },
        $set: { expiresAt },
        $push: { entries: { $each: [entry], $slice: -MAX_ENTRIES } },
      }, { upsert: true });
      if (!updated || updated.modifiedCount === 1 || updated.upsertedCount === 1) return entry;
    } catch (error) {
      if (!/E11000|duplicate key/i.test(String(error))) throw error;
    }
    // Duplicate _id from an existing checkpoint is either an idempotent retry
    // or a different step raced the first insert. Do not swallow payload drift.
    const row = await collection.findOne({ _id: key, projectId: scope.projectId,
      chatId: scope.chatId }, { projection: { entries: 1 } });
    const prior = Array.isArray(row?.entries) ? row.entries.find(item =>
      item.taskId === entry.taskId && item.step === entry.step) : undefined;
    if (prior) {
      if (prior.action !== entry.action || prior.failed !== entry.failed ||
          prior.observation !== entry.observation)
        throw Error("Checkpoint step collision with different observation");
      return prior;
    }
  }
  throw Error("Checkpoint could not commit after retry contention");
}
export async function listSharedCheckpoints(collection, scope, taskId, now = new Date()) {
  const key = checkpointScopeKey(scope);
  const row = await collection.findOne({ _id: key, projectId: scope.projectId,
    chatId: scope.chatId, expiresAt: { $gt: now } }, { projection: { entries: 1 } });
  const entries = Array.isArray(row?.entries) ? row.entries : [];
  return entries.filter(item => item && typeof item.taskId === "string" &&
    typeof item.action === "string" && typeof item.observation === "string" &&
    typeof item.step === "number" && typeof item.failed === "boolean" &&
    (!taskId || item.taskId === taskId)).slice(-MAX_ENTRIES);
}
export async function deleteSharedCheckpoints(collection, scope) {
  return (await collection.deleteOne({ _id: checkpointScopeKey(scope),
    projectId: scope.projectId, chatId: scope.chatId })).deletedCount === 1;
}
