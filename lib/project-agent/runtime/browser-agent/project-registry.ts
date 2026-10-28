import { randomUUID } from "node:crypto";
import { getMongoAiDb } from "@/services/mongodb/client";
import { createSteelRemote, releaseSteelRemote } from "./steel-session";

type State = "vacant" | "creating" | "active" | "closed";
export interface ProjectBrowserRecord {
  _id: string; projectId: string; owner: string; state: State;
  generation: number; steelId?: string; reservedSteelId?: string;
  releasePendingSteelId?: string;
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
    if (row.reservedSteelId && row.state !== "active" && row.state !== "creating")
      throw new Error("Reserved Steel creation outcome unknown; reconcile before reopening");
    if (row.state === "closed" && !allowReopen)
      throw new Error("User closed the Project browser. Reopen it from the right panel.");
    if (row.state === "active" && row.expiresAt && row.expiresAt > Date.now() + 1000)
      return row;
    const now = Date.now();
    // An expired claim does NOT prove the remote create request failed.
    // After SIGKILL, Steel may have created a browser before Mongo received its ID.
    // Reclaiming would silently create a second remote browser for this owner.
    if (row.state === "creating" && (row.claimUntil ?? 0) <= now)
      throw new Error("Project browser creation outcome is unknown; reconcile Steel sessions before retry");
    const canClaim = row.state === "vacant" || row.state === "closed" ||
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
    // Opt in only after confirming that the deployed Steel API honors sessionId.
    const reservedId = process.env.PROJECT_AGENT_STEEL_RESERVED_SESSION_IDS === "1" ?
      randomUUID() : undefined;
    const claimed = await coll.updateOne({ ...identity, generation: row.generation,
      state: row.state, ...(row.claimToken ? { claimToken: row.claimToken } : {}) },
    { $set: { state: "creating", claimToken, claimUntil: now + 45_000,
      lastUsedAt: now, activeTabIndex: 0,
      ...(reservedId ? { reservedSteelId: reservedId } : {}) },
      $inc: { generation: 1 },
      $unset: { steelId: "", expiresAt: "" } });
    if (claimed.modifiedCount !== 1) continue;
    let steelId: string | undefined;
    try {
      const created = await createSteelRemote(reservedId);
      steelId = created.id;
      if (reservedId && steelId !== reservedId)
        throw new Error("Steel did not honor the reserved session ID");
      const success = await coll.updateOne({ ...identity, state: "creating", claimToken },
        { $set: { state: "active", steelId, expiresAt: Date.now() + created.timeout,
          lastUsedAt: Date.now() },
          $unset: { claimToken: "", claimUntil: "", reservedSteelId: "" } });
      if (success.modifiedCount !== 1) throw new Error("Project browser creation was fenced");
      const active = await findProjectRecord(scope, projectId, owner);
      if (!active) throw new Error("New Steel session was not visible");
      return active;
    } catch (error) {
      if (steelId) {
        // A lost Mongo acknowledgement may mean the active ID was committed.
        // Never release a session that another worker can already reattach to.
        const latest = await coll.findOne(identity);
        if (latest?.state === "active" && latest.steelId === steelId)
          throw error;
        let pending = false;
        if (latest?.state === "creating" && latest.claimToken === claimToken) {
          const marked = await coll.updateOne({ ...identity, state: "creating", claimToken },
            { $set: { state: "vacant", releasePendingSteelId: steelId },
              $unset: { claimToken: "", claimUntil: "", reservedSteelId: "" } });
          pending = marked.modifiedCount === 1;
        } else if (latest?.state === "closed" && !latest.steelId &&
                   !latest.releasePendingSteelId) {
          // Stop may have won while the Steel creation request was in flight.
          const marked = await coll.updateOne({ ...identity, state: "closed",
            generation: latest.generation, releasePendingSteelId: { $exists: false } },
          { $set: { releasePendingSteelId: steelId },
            $unset: { reservedSteelId: "" } });
          pending = marked.modifiedCount === 1;
        }
        try {
          if (pending) await finishPendingRelease(coll, identity, steelId);
          else await releaseSteelRemote(steelId);
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError],
            pending ? "Project browser creation failed; Steel cleanup is pending" :
              "Project browser creation failed; Steel cleanup was not confirmed");
        }
      } else {
        // An unsuccessful POST response does not prove Steel rejected creation:
        // the remote session might exist even if the ID never reached this worker.
        // Fence subsequent opens until an operator reconciles the external outcome.
        await coll.updateOne({ ...identity, state: "creating", claimToken },
          { $set: { claimUntil: 0, lastUsedAt: Date.now() } });
        throw new AggregateError([error],
          "Project browser creation outcome is unknown; reconcile Steel sessions before retry");
      }
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
