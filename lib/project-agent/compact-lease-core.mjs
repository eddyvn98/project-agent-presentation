import { createHash, randomUUID } from "node:crypto";

export const COMPACTION_LEASE_COLLECTION = "projectAgentCompactLeases";
const expires = (ms) => new Date(ms).toISOString();
export function compactionKey(scope) {
  if (!scope || !scope.projectId?.trim() || !scope.ownerEmail?.trim() ||
      !scope.conversationId?.trim()) throw Error("Invalid compaction scope");
  return createHash("sha256").update(scope.projectId).update("\0")
    .update(scope.ownerEmail.toLowerCase()).update("\0")
    .update(scope.conversationId).digest("hex");
}
/** Atomic, source-versioned, distributed lock. One source task may compact at most once. */
export async function claimCompaction(coll, scope, sourceTaskId, now = Date.now()) {
  if (!sourceTaskId) throw Error("Missing compaction source");
  const id = compactionKey(scope);
  try {
    await coll.updateOne({ _id: id }, { $setOnInsert: {
      projectId: scope.projectId, ownerEmail: scope.ownerEmail.toLowerCase(),
      conversationId: scope.conversationId, state: "idle", epoch: 0,
    } }, { upsert: true });
  } catch (error) {
    if (!/E11000|duplicate key/i.test(String(error))) throw error;
  }
  const token = randomUUID();
  const result = await coll.findOneAndUpdate({
    _id: id, lastSourceTaskId: { $ne: sourceTaskId },
    $or: [{ state: "idle" }, { state: "active", leaseUntil: { $lte: expires(now) } }],
  }, { $set: { state: "active", token, sourceTaskId,
    leaseUntil: expires(now + 300_000) }, $inc: { epoch: 1 } },
  { returnDocument: "after" });
  const row = result?.value ?? result;
  if (row?.token !== token) return null;
  return { id, token, epoch: row.epoch, sourceTaskId };
}
export async function finishCompaction(coll, claim, conversationId, now = Date.now()) {
  const result = await coll.updateOne({ _id: claim.id, token: claim.token,
    epoch: claim.epoch, state: "active", leaseUntil: { $gt: expires(now) } },
  { $set: { state: "idle", lastSourceTaskId: claim.sourceTaskId,
    lastConversationId: conversationId }, $unset: { token: "", leaseUntil: "",
    sourceTaskId: "" } });
  return result.modifiedCount === 1;
}
export async function releaseCompaction(coll, claim) {
  const result = await coll.updateOne({ _id: claim.id, token: claim.token,
    epoch: claim.epoch, state: "active" }, { $set: { state: "idle" },
    $unset: { token: "", leaseUntil: "", sourceTaskId: "" } });
  return result.modifiedCount === 1;
}
export async function stopCompaction(coll, scope) {
  const result = await coll.updateOne({ _id: compactionKey(scope), state: "active" },
    { $set: { state: "idle" }, $unset: { token: "", leaseUntil: "", sourceTaskId: "" },
      $inc: { epoch: 1 } });
  return result.modifiedCount === 1;
}
