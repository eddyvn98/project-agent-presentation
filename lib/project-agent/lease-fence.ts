import { AsyncLocalStorage } from "node:async_hooks";
import { getMongoAiDb } from "@/services/mongodb/client";

interface LeaseIdentity { taskId: string; token: string }
const leaseContext = new AsyncLocalStorage<LeaseIdentity>();
const iso = () => new Date().toISOString();

/** Propagates the current Mongo lease through model, subagent and tool awaits. */
export function runWithLeaseFence<T>(identity: LeaseIdentity, work: () => Promise<T>): Promise<T> {
  return leaseContext.run(identity, work);
}

/** Fails closed on Mongo errors or expired/replaced lease, immediately before action dispatch. */
export async function assertActiveTaskLease(): Promise<void> {
  const identity = leaseContext.getStore();
  if (!identity) return; // Legacy queue-disabled mode is intentionally unchanged.
  const db = await getMongoAiDb();
  const active = await db.collection("projectAgentDurableTasks").findOne({
    _id: identity.taskId, leaseToken: identity.token, state: "running",
    leaseUntil: { $gt: iso() },
  }, { projection: { _id: 1 } });
  if (!active) throw new Error("MongoDB task lease expired or changed; no new action is allowed");
}
