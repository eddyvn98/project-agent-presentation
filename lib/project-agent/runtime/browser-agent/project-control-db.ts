import { randomUUID } from "node:crypto";
import { getMongoAiDb } from "@/services/mongodb/client";

interface ControlRow {
  _id: string; mode: "agent" | "human"; revision: number;
  humanUntil?: number; agentTaskId?: string; agentUntil?: number;
  opToken?: string; opUntil?: number;
}
export interface ProjectControlState { paused: boolean; revision: number; activeTaskId?: string }
const COLLECTION = "projectAgentSharedBrowserControl";
const unwrap = (row: any): ControlRow | null => row?.value ?? row ?? null;
async function collection() {
  return (await getMongoAiDb()).collection<ControlRow>(COLLECTION);
}
async function ensure(scope: string) {
  const coll = await collection();
  try {
    await coll.updateOne({ _id: scope }, { $setOnInsert: {
      _id: scope, mode: "agent" as const, revision: 0,
    } }, { upsert: true });
  } catch (error) {
    if (!/E11000|duplicate key/i.test(String(error))) throw error;
  }
  return coll;
}
export async function readProjectControl(scope: string): Promise<ProjectControlState> {
  const coll = await ensure(scope);
  const row = await coll.findOne({ _id: scope });
  if (!row) throw new Error("Shared browser control missing");
  if (row.mode === "human" && (row.humanUntil ?? 0) < Date.now() &&
      (!row.opToken || (row.opUntil ?? 0) < Date.now())) {
    await coll.updateOne({ _id: scope, mode: "human", revision: row.revision },
      { $set: { mode: "agent" }, $unset: { humanUntil: "" }, $inc: { revision: 1 } });
    return readProjectControl(scope);
  }
  return { paused: row.mode === "human", revision: row.revision,
    activeTaskId: row.agentUntil && row.agentUntil > Date.now() ? row.agentTaskId : undefined };
}
export async function takeProjectControl(scope: string): Promise<void> {
  const coll = await ensure(scope), now = Date.now();
  const row = await coll.findOneAndUpdate({ _id: scope,
    $or: [{ mode: "agent" }, { mode: "human", humanUntil: { $lt: now } }],
    $and: [{ $or: [{ opToken: { $exists: false } }, { opUntil: { $lt: now } }] }],
  }, { $set: { mode: "human", humanUntil: now + 5 * 60_000 },
    $inc: { revision: 1 } }, { returnDocument: "after" });
  if (!unwrap(row)) throw new Error("Browser busy; try takeover after the active action ends");
}
export async function keepProjectControl(scope: string): Promise<boolean> {
  const now = Date.now();
  const result = await (await collection()).updateOne({ _id: scope, mode: "human",
    humanUntil: { $gt: now } },
  { $set: { humanUntil: now + 5 * 60_000 } });
  return result.matchedCount === 1;
}
export async function handbackProjectControl(scope: string): Promise<void> {
  const coll = await ensure(scope);
  const now = Date.now();
  const result = await coll.updateOne({ _id: scope, mode: "human",
    $or: [{ opToken: { $exists: false } }, { opUntil: { $lt: now } }] },
  { $set: { mode: "agent" }, $unset: { humanUntil: "" }, $inc: { revision: 1 } });
  if (result.matchedCount !== 1)
    throw new Error("Wait for browser input to finish before handback");
}
export async function claimProjectAgent(scope: string, taskId: string): Promise<void> {
  if (!taskId) throw new Error("Task identity required for shared browser");
  const coll = await ensure(scope);
  const now = Date.now(), row = await coll.findOne({ _id: scope });
  if (!row) throw new Error("Shared browser control unavailable");
  if (row.agentTaskId === taskId && (row.agentUntil ?? 0) > now) {
    const renewed = await coll.updateOne({ _id: scope, mode: "agent",
      agentTaskId: taskId, agentUntil: { $gt: now } },
      { $set: { agentUntil: now + 90_000 } });
    if (renewed.matchedCount !== 1) throw new Error("Agent lost browser control");
    return;
  }
  const result = await coll.updateOne({ _id: scope, mode: "agent",
    $or: [{ agentTaskId: { $exists: false } }, { agentUntil: { $lt: now } }],
    $and: [{ $or: [{ opToken: { $exists: false } }, { opUntil: { $lt: now } }] }],
  }, { $set: { agentTaskId: taskId, agentUntil: now + 90_000 },
    $inc: { revision: 1 } });
  if (result.matchedCount !== 1)
    throw new Error("Project browser is controlled by the user or another Agent task");
}
/** Extend only the same live task's lease, including during a human takeover. */
export async function renewProjectAgent(scope: string, taskId: string): Promise<boolean> {
  const now = Date.now();
  const result = await (await collection()).updateOne({
    _id: scope, agentTaskId: taskId, agentUntil: { $gt: now },
  }, { $set: { agentUntil: now + 90_000 } });
  return result.matchedCount === 1;
}
export async function releaseProjectAgent(scope: string, taskId: string): Promise<void> {
  await (await collection()).updateOne({ _id: scope, agentTaskId: taskId },
    { $unset: { agentTaskId: "", agentUntil: "" }, $inc: { revision: 1 } });
}
export async function clearProjectControl(scope: string): Promise<void> {
  await (await collection()).deleteOne({ _id: scope });
}
/** Distributed fencing: one Playwright operation at a time across Next workers. */
export async function withProjectControlOp<T>(scope: string,
  mode: "agent" | "human" | "system", taskId: string | undefined,
  fn: (revision: number) => Promise<T>, onLost?: () => void): Promise<T> {
  const coll = await ensure(scope);
  const now = Date.now(), token = randomUUID();
  const authority = mode === "agent" ?
    { mode: "agent", agentTaskId: taskId, agentUntil: { $gt: now } } :
    mode === "human" ? { mode: "human", humanUntil: { $gt: now } } :
      { mode: "agent", $and: [{ $or: [{ agentTaskId: { $exists: false } },
        { agentUntil: { $lt: now } }] }] };
  const row = await coll.findOneAndUpdate({
    _id: scope, ...authority,
    $or: [{ opToken: { $exists: false } }, { opUntil: { $lt: now } }],
  }, { $set: { opToken: token, opUntil: now + 42_000 } },
  { returnDocument: "after" });
  if (!unwrap(row) || unwrap(row)?.opToken !== token)
    throw new Error("Browser control changed or another action is running");
  let lost = false, refreshing = false;
  const refresh = async () => {
    if (refreshing || lost) return;
    refreshing = true;
    try {
      const result = await coll.updateOne({ _id: scope, opToken: token },
        { $set: { opUntil: Date.now() + 42_000 } });
      if (result.matchedCount !== 1) throw new Error("Operation lease fenced");
    } catch {
      lost = true;
      onLost?.(); // Disconnect the action's CDP connection if Mongo fencing fails.
    } finally { refreshing = false; }
  };
  const timer = setInterval(() => { void refresh(); }, 8_000);
  timer.unref?.();
  try {
    const value = await fn(unwrap(row)!.revision);
    if (lost) throw new Error("Browser operation lease was lost");
    return value;
  } finally {
    clearInterval(timer);
    const released = await coll.updateOne({ _id: scope, opToken: token },
      { $unset: { opToken: "", opUntil: "" } });
    if (released.matchedCount !== 1) onLost?.();
  }
}
/** Stop-aware handback wait; Mongo status crosses process boundaries. */
export async function waitForProjectControl(scope: string, signal?: AbortSignal) {
  while (true) {
    if (signal?.aborted) throw signal.reason ?? new Error("Task stopped");
    const status = await readProjectControl(scope);
    if (!status.paused) return status;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { signal?.removeEventListener("abort", aborted); resolve(); }, 300);
      const aborted = () => { clearTimeout(timeout); reject(signal?.reason ?? new Error("Task stopped")); };
      signal?.addEventListener("abort", aborted, { once: true });
      if (signal?.aborted) aborted();
    });
  }
}
