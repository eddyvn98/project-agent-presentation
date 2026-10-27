import { getMongoAiDb } from "@/services/mongodb/client";

const WINDOW_MS = 120_000;
interface WatchGrant {
  _id: string; owner: string; projectId: string; expiresAt: number;
}
const collection = async () =>
  (await getMongoAiDb()).collection<WatchGrant>("projectAgentBrowserWatchGrants");

/** Explicit, task-owner-scoped opt-in shared by the agent and viewer workers. */
export async function setSharedBrowserWatch(taskId: string, projectId: string,
  owner: string, enabled: boolean): Promise<void> {
  const coll = await collection();
  const identity = owner.trim().toLowerCase();
  if (!enabled) {
    await coll.deleteOne({ _id: taskId, owner: identity, projectId });
    return;
  }
  await coll.updateOne({ _id: taskId }, { $set: {
    owner: identity, projectId, expiresAt: Date.now() + WINDOW_MS,
  } }, { upsert: true });
}
export async function sharedBrowserWatchAllowed(taskId: string, projectId: string,
  owner: string): Promise<boolean> {
  const grant = await (await collection()).findOne({
    _id: taskId, owner: owner.trim().toLowerCase(), projectId,
    expiresAt: { $gt: Date.now() },
  });
  return Boolean(grant);
}
