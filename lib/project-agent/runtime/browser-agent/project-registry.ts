import { randomUUID } from "node:crypto";
import { getMongoAiDb } from "@/services/mongodb/client";
import { createSteelRemote, releaseSteelRemote } from "./steel-session";

type State = "vacant" | "creating" | "active" | "closed";
export interface ProjectBrowserRecord {
  _id: string; projectId: string; owner: string; state: State;
  generation: number; steelId?: string; releasePendingSteelId?: string;
  expiresAt?: number; activeTabIndex?: number;
  claimToken?: string; claimUntil?: number; lastUsedAt: number;
}
const COLLECTION = "projectAgentSharedBrowsers";
const normalize = (owner: string) => owner.trim().toLowerCase();
async function collection() {
  return (await getMongoAiDb()).collection<ProjectBrowserRecord>(COLLECTION);
}
async function initial(scope: string, projectId: string, owner: string) {
  const coll = await collection();
  try {
    await coll.updateOne({ _id: scope }, { $setOnInsert: {
      _id: scope, projectId, owner: normalize(owner),
      state: "vacant" as State, generation: 0, lastUsedAt: Date.now(),
    } }, { upsert: true });
  } catch (error) {
    if (!/E11000|duplicate key/i.test(String(error))) throw error;
  }
  return coll;
}
/** Keep the exact remote ID until release succeeds. Safe to retry across workers. */
async function finishPendingRelease(
  coll: Awaited<ReturnType<typeof collection>>,
  identity: { _id: string; projectId: string; owner: string }, steelId: string,
) {
  await releaseSteelRemote(steelId);
  await coll.updateOne({ ...identity, releasePendingSteelId: steelId },
    { $unset: { releasePendingSteelId: "" } });
}
export async function projectRecordByKey(scope: string, owner: string) {
  return (await collection()).findOne({ _id: scope, owner: normalize(owner),
    state: "active", expiresAt: { $gt: Date.now() + 1000 } });
}
export async function findProjectRecord(scope: string, projectId: string, owner: string) {
  const coll = await collection();
  const row = await coll.findOne({ _id: scope, projectId, owner: normalize(owner),
    state: "active", expiresAt: { $gt: Date.now() + 1000 } });
  return row ?? null;
}
/** Mongo CAS avoids spawning a different Chromium session in concurrent Next workers. */
export async function ensureProjectRecord(scope: string, projectId: string,
  owner: string, signal?: AbortSignal, allowReopen = false): Promise<ProjectBrowserRecord> {
  const coll = await initial(scope, projectId, owner);
  const identity = { _id: scope, projectId, owner: normalize(owner) };
  const started = Date.now();
  while (Date.now() - started < 50_000) {
    if (signal?.aborted) throw signal.reason ?? new Error("Task stopped");
    const row = await coll.findOne(identity);
    if (!row) throw new Error("Project browser record was not initialized");
    // A previous close may have committed locally before Steel acknowledged release.
    // Never create a replacement while the remote session is still pending cleanup.
    if (row.releasePendingSteelId) {
      await finishPendingRelease(coll, identity, row.releasePendingSteelId);
      continue;
    }
    if (row.state === "closed" && !allowReopen)
      throw new Error("User closed the Project browser. Reopen it from the right panel.");
    if (row.state === "active" && row.expiresAt && row.expiresAt > Date.now() + 1000)
      return row;
    const now = Date.now();
    const canClaim = row.state === "vacant" || row.state === "closed" ||
      (row.state === "creating" && (row.claimUntil ?? 0) <= now) ||
      (row.state === "active" && (row.expiresAt ?? 0) <= now + 1000);
    if (!canClaim) {
      await new Promise(resolve => setTimeout(resolve, 300));
      continue;
    }
    // Release expired remote session before clearing its ID from the Mongo record.
    // If Steel is unavailable, the old ID remains retryable and no new session opens.
    if (row.state === "active" && row.steelId)
      await releaseSteelRemote(row.steelId);
    const claimToken = randomUUID();
    const claimed = await coll.updateOne({ ...identity, generation: row.generation,
      state: row.state, ...(row.claimToken ? { claimToken: row.claimToken } : {}) },
    { $set: { state: "creating", claimToken, claimUntil: now + 45_000,
      lastUsedAt: now, activeTabIndex: 0 }, $inc: { generation: 1 },
      $unset: { steelId: "", expiresAt: "" } });
    if (claimed.modifiedCount !== 1) continue;
    let steelId: string | undefined;
    try {
      const created = await createSteelRemote();
      steelId = created.id;
      const success = await coll.updateOne({ ...identity, state: "creating", claimToken },
        { $set: { state: "active", steelId, expiresAt: Date.now() + created.timeout,
          lastUsedAt: Date.now() },
          $unset: { claimToken: "", claimUntil: "" } });
      if (success.modifiedCount !== 1) throw new Error("Project browser creation was fenced");
      const active = await findProjectRecord(scope, projectId, owner);
      if (!active) throw new Error("New Steel session was not visible");
      return active;
    } catch (error) {
      if (steelId) await releaseSteelRemote(steelId).catch(() => {});
      await coll.updateOne({ ...identity, state: "creating", claimToken },
        { $set: { state: "vacant" }, $unset: { claimToken: "", claimUntil: "" } });
      throw error;
    }
  }
  throw new Error("Project browser creation is busy; try again");
}
export async function updateProjectActiveTab(scope: string, steelId: string, index: number) {
  if (!Number.isSafeInteger(index) || index < 0 || index > 7)
    throw new Error("Invalid browser tab");
  const result = await (await collection()).updateOne({
    _id: scope, steelId, state: "active", expiresAt: { $gt: Date.now() },
  }, { $set: { activeTabIndex: index, lastUsedAt: Date.now() } });
  if (result.matchedCount !== 1) throw new Error("Shared browser session is stale");
}
export async function touchProjectRecord(scope: string, steelId: string): Promise<boolean> {
  const result = await (await collection()).updateOne({
    _id: scope, steelId, state: "active", expiresAt: { $gt: Date.now() },
  }, { $set: { lastUsedAt: Date.now() } });
  return result.matchedCount === 1;
}
export async function closeProjectRecord(scope: string, projectId: string, owner: string) {
  const coll = await collection();
  const identity = { _id: scope, projectId, owner: normalize(owner) };
  const previous = await coll.findOne(identity);
  if (!previous) return;
  if (previous.releasePendingSteelId)
    await finishPendingRelease(coll, identity, previous.releasePendingSteelId);
  // An already-closed record remains closed even if cleanup is retried.
  if (previous.state === "closed" && !previous.steelId) return;
  const closed = await coll.updateOne({ ...identity, generation: previous.generation },
    { $set: { state: "closed", lastUsedAt: Date.now(),
        ...(previous.steelId ? { releasePendingSteelId: previous.steelId } : {}) },
      $inc: { generation: 1 },
      $unset: { steelId: "", expiresAt: "", claimToken: "", claimUntil: "" } });
  if (closed.modifiedCount !== 1) throw new Error("Browser close raced with session creation");
  if (previous.steelId) await finishPendingRelease(coll, identity, previous.steelId);
}
