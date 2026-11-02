import { AsyncLocalStorage } from "node:async_hooks";
import { getMongoAiDb } from "@/services/mongodb/client";

interface LeaseIdentity { taskId: string; token: string }
const leaseContext = new AsyncLocalStorage<LeaseIdentity>();
const conversationContext = new AsyncLocalStorage<{ key: string; token: string }>();
const iso = () => new Date().toISOString();

/** Propagates the current Mongo lease through model, subagent and tool awaits. */
export function runWithLeaseFence<T>(identity: LeaseIdentity, work: () => Promise<T>): Promise<T> {
  return leaseContext.run(identity, work);
}

export function runWithConversationFence<T>(identity: { key: string; token: string }, work: () => Promise<T>): Promise<T> {
  return conversationContext.run(identity, work);
}

/** Fails closed on Mongo errors or expired/replaced lease, immediately before action dispatch. */
export async function assertActiveTaskLease(): Promise<void> {
  const identity = leaseContext.getStore();
  const conversation = conversationContext.getStore();
  if (!identity && !conversation) return;
  const db = await getMongoAiDb();
  const active = !identity || await db.collection<{ _id: string; leaseToken: string; state: string; leaseUntil: string }>("projectAgentDurableTasks").findOne({
    _id: identity.taskId, leaseToken: identity.token, state: "running",
    leaseUntil: { $gt: iso() },
  }, { projection: { _id: 1 } });
  if (!active) throw new Error("MongoDB task lease expired or changed; no new action is allowed");
  if (conversation && !await db.collection<{ _id: string; token: string; expiresAt: string }>("projectAgentConversationLeases").findOne({
    _id: conversation.key, token: conversation.token, expiresAt: { $gt: iso() },
  }, { projection: { _id: 1 } })) throw new Error("MongoDB task lease expired or changed; conversation lease lost");
}
