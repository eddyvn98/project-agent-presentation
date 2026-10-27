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
  await collection.updateOne({ _id: key, projectId: scope.projectId, chatId: scope.chatId }, {
    $setOnInsert: { projectId: scope.projectId, chatId: scope.chatId },
    $set: { expiresAt },
    $push: { entries: { $each: [entry], $slice: -MAX_ENTRIES } },
  }, { upsert: true });
  return entry;
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
