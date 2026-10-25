import { randomUUID } from "node:crypto";

const stamp = (now = Date.now()) => new Date(now).toISOString();
const active = ["agent", "human"];
const unwrap = (result) => result?.value ?? result ?? null;

/** Same atomic Mongo operations are used by the runtime and the two-process QA. */
export async function claimBrowserLease(coll, id, ownerEmail, workerId, now = Date.now()) {
  const owner = ownerEmail.trim().toLowerCase();
  try {
    await coll.updateOne({ _id: id }, { $setOnInsert: {
      _id: id, ownerEmail: owner, state: "vacant", epoch: 0, revision: 0,
    } }, { upsert: true });
  } catch (cause) {
    if (!/E11000|duplicate key/i.test(String(cause))) throw cause;
  }
  const token = randomUUID();
  const row = unwrap(await coll.findOneAndUpdate({
    _id: id, ownerEmail: owner, state: "vacant",
  }, {
    $set: { state: "agent", workerId, leaseToken: token,
      leaseUntil: stamp(now + 120_000) },
    $inc: { epoch: 1, revision: 1 },
  }, { returnDocument: "after" }));
  return row?.leaseToken === token ? {
    id, ownerEmail: owner, workerId, token, epoch: row.epoch, revision: row.revision,
  } : null;
}
export async function assertBrowserLease(coll, claim, mode = "agent", now = Date.now()) {
  if (!claim) throw new Error("Browser ownership is missing");
  const row = await coll.findOne({
    _id: claim.id, ownerEmail: claim.ownerEmail, workerId: claim.workerId,
    leaseToken: claim.token, epoch: claim.epoch, revision: claim.revision,
    state: mode, leaseUntil: { $gt: stamp(now) },
  }, { projection: { _id: 1, revision: 1 } });
  if (!row) throw new Error("Browser ownership was lost or control changed");
  return row.revision;
}
export async function renewBrowserLease(coll, claim, now = Date.now()) {
  const result = await coll.updateOne({
    _id: claim.id, ownerEmail: claim.ownerEmail, workerId: claim.workerId,
    leaseToken: claim.token, epoch: claim.epoch, state: { $in: active },
    leaseUntil: { $gt: stamp(now) },
  }, { $set: { leaseUntil: stamp(now + 120_000) } });
  return result.matchedCount === 1;
}
export async function changeBrowserControl(coll, claim, from, to, now = Date.now()) {
  if (!((from === "agent" && to === "human") ||
        (from === "human" && to === "agent")))
    throw new Error("Invalid browser control transition");
  const row = unwrap(await coll.findOneAndUpdate({
    _id: claim.id, ownerEmail: claim.ownerEmail, workerId: claim.workerId,
    leaseToken: claim.token, epoch: claim.epoch, revision: claim.revision,
    state: from, leaseUntil: { $gt: stamp(now) },
  }, { $set: { state: to }, $inc: { revision: 1 } },
  { returnDocument: "after" }));
  if (!row || row.leaseToken !== claim.token)
    throw new Error("Browser takeover/handback was fenced");
  claim.revision = row.revision;
  return row.revision;
}
export async function finishBrowserLease(coll, claim) {
  const result = await coll.updateOne({
    _id: claim.id, workerId: claim.workerId, leaseToken: claim.token,
    epoch: claim.epoch, state: { $in: active },
  }, { $set: { state: "closed" },
    $unset: { leaseToken: "", leaseUntil: "" }, $inc: { revision: 1 } });
  return result.modifiedCount === 1;
}
export async function stopBrowserLease(coll, id, ownerEmail) {
  const result = await coll.updateOne({
    _id: id, ownerEmail: ownerEmail.trim().toLowerCase(),
    state: { $in: [...active, "vacant", "quarantined"] },
  }, { $set: { state: "stopped" }, $unset: {
    leaseToken: "", leaseUntil: "",
  }, $inc: { revision: 1 } });
  return result.modifiedCount === 1;
}
export async function quarantineExpiredBrowser(coll, id, now = Date.now()) {
  const row = unwrap(await coll.findOneAndUpdate({
    _id: id, state: { $in: active },
    leaseUntil: { $lt: stamp(now) },
  }, { $set: { state: "quarantined" },
    $unset: { leaseToken: "", leaseUntil: "" },
    $inc: { revision: 1 } }, { returnDocument: "after" }));
  return row?.state === "quarantined";
}
/** Explicit review does NOT replay any old model action or browser state. */
export async function acknowledgeBrowserRecovery(coll, id, ownerEmail, reviewed) {
  if (reviewed !== true) throw new Error("Human review is required");
  const result = await coll.updateOne({
    _id: id, ownerEmail: ownerEmail.trim().toLowerCase(), state: "quarantined",
  }, { $set: { state: "vacant" }, $unset: { workerId: "" },
    $inc: { revision: 1 } });
  return result.modifiedCount === 1;
}
