import { randomUUID } from "node:crypto";
import { runWithLeaseFence } from "./lease-fence";
import { queueRecoveryDecision } from "./recovery-decision";
import { getMongoAiDb } from "@/services/mongodb/client";
import { readProjectAgentTask, updateProjectAgentTask } from "./task-store";

export type QueueState = "queued" | "running" | "done" | "failed" | "needs_review";
export interface QueueReceipt {
  taskId: string; state: QueueState; queuedAt: string;
  startedAt?: string; completedAt?: string; error?: string; attempt: number;
}
interface Stored extends QueueReceipt {
  _id: string; leaseToken?: string; leaseUntil?: string;
}
const validTask = (id: string) => /^pat_[a-f0-9]{12}$/.test(id);
const iso = () => new Date().toISOString();
let indexes: Promise<unknown> | undefined;
async function collection() {
  const db = await getMongoAiDb();
  const coll = db.collection<Stored>("projectAgentDurableTasks");
  if (!indexes) indexes = Promise.all([
    coll.createIndex({ state: 1, queuedAt: 1 }),
    coll.createIndex({ state: 1, leaseUntil: 1 }),
  ]).catch(error => { indexes = undefined; throw error; });
  await indexes;
  return coll;
}
function visible(row: Stored): QueueReceipt {
  return { taskId: row.taskId, state: row.state, queuedAt: row.queuedAt,
    attempt: row.attempt, startedAt: row.startedAt,
    completedAt: row.completedAt, error: row.error };
}
export async function readQueueReceipt(id: string): Promise<QueueReceipt | null> {
  if (!validTask(id)) throw new Error("Invalid task ID");
  const row = await (await collection()).findOne({ _id: id });
  return row ? visible(row) : null;
}
export async function enqueueDurableTask(id: string): Promise<QueueReceipt> {
  if (!validTask(id) || !await readProjectAgentTask(id)) throw new Error("Task does not exist");
  const coll = await collection();
  await coll.updateOne({ _id: id }, { $setOnInsert: {
    _id: id, taskId: id, state: "queued", queuedAt: iso(), attempt: 0,
  } }, { upsert: true });
  return (await readQueueReceipt(id))!;
}
export async function withDurableTaskLease(id: string, work: () => Promise<void>, onLeaseLost?: () => void) {
  const coll = await collection(), token = randomUUID(), now = iso();
  const record = await coll.findOneAndUpdate({ _id: id, state: "queued" },
    { $set: { state: "running", startedAt: now, leaseToken: token,
      leaseUntil: new Date(Date.now() + 120000).toISOString() },
      $inc: { attempt: 1 } }, { returnDocument: "after" });
  if (!record || record.leaseToken !== token) return false;
  let lastHeartbeat = Date.now(), lostLease = false;
  const heartbeat = setInterval(() => {
    void coll.updateOne({ _id: id, leaseToken: token, state: "running" },
      { $set: { leaseUntil: new Date(Date.now() + 120000).toISOString() } })
      .then(result => {
        if (!result.matchedCount) {
          if (!lostLease) { lostLease = true; onLeaseLost?.(); }
        } else lastHeartbeat = Date.now();
      }).catch(() => {
        if (Date.now() - lastHeartbeat > 60000 && !lostLease) {
          lostLease = true; onLeaseLost?.();
        }
      });
  }, 20000);
  heartbeat.unref?.();
  try {
    const task = await readProjectAgentTask(id);
    if (!task || task.cancelled || ["done", "failed"].includes(task.status)) {
      await coll.updateOne({ _id: id, leaseToken: token }, { $set: {
        state: task?.status === "done" ? "done" : "failed", completedAt: iso(),
      }, $unset: { leaseToken: "", leaseUntil: "" } });
      return false;
    }
    try { await runWithLeaseFence({ taskId: id, token }, work); if (lostLease) throw new Error("MongoDB worker lease was lost"); }
    catch (error) {
      await coll.updateOne({ _id: id, leaseToken: token }, { $set: {
        state: "needs_review", completedAt: iso(),
        error: error instanceof Error ? error.message.slice(0, 200) : "Worker failed",
      }, $unset: { leaseToken: "", leaseUntil: "" } });
      throw error;
    }
    const completed = await readProjectAgentTask(id);
    await coll.updateOne({ _id: id, leaseToken: token }, { $set: {
      state: completed?.status === "done" ? "done" : "failed",
      completedAt: iso(), error: completed?.error?.slice(0, 200),
    }, $unset: { leaseToken: "", leaseUntil: "" } });
    return true;
  } finally { clearInterval(heartbeat); }
}
/** Uncertain side effects are quarantined and NEVER auto replayed. */
export async function scanDurableQueue(limit = 100) {
  const coll = await collection(), queued: string[] = [];
  const waiting = await coll.find({ state: "queued" })
    .sort({ queuedAt: 1 }).limit(limit).toArray();
  for (const row of waiting) queued.push(row.taskId);
  let uncertain = 0;
  const stale = await coll.find({ state: "running",
    leaseUntil: { $lt: iso() } }).limit(100).toArray();
  for (const row of stale) {
    const task = await readProjectAgentTask(row.taskId);
    const terminal = task && ["done", "failed"].includes(task.status);
    const decision = queueRecoveryDecision(row.state, task?.status ?? null, true);
    const state: QueueState = decision === "complete" ? "done" :
      decision === "fail" ? "failed" : "needs_review";
    const result = await coll.updateOne({ _id: row._id, leaseToken: row.leaseToken,
      state: "running", leaseUntil: { $lt: iso() } }, { $set: {
      state, completedAt: iso(),
      ...(terminal ? {} : { error: "Worker heartbeat expired; external effects need review" }),
    }, $unset: { leaseToken: "", leaseUntil: "" } });
    if (!result.modifiedCount || terminal) continue;
    await updateProjectAgentTask(row.taskId, {
      status: "failed", completedAt: iso(),
      error: "Worker interrupted; inspect external effects before retrying",
      logLine: "failed: Mongo queue requires review",
    }).catch(() => {});
    uncertain++;
  }
  return { queued, uncertain };
}
/** Optional one-time data migration. Never replay legacy running work automatically. */
export async function importLegacyQueueReceipt(receipt: QueueReceipt) {
  if (!validTask(receipt.taskId)) throw new Error("Invalid task ID");
  await (await collection()).updateOne({ _id: receipt.taskId }, { $setOnInsert: {
    ...receipt, _id: receipt.taskId,
    state: receipt.state === "running" ? "needs_review" : receipt.state,
  } }, { upsert: true });
}
