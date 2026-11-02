import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { getMongoAiDb } from "@/services/mongodb/client";
import { runWithConversationFence } from "./lease-fence";
import { readProjectAgentTask } from "./task-store";
import type { ProjectAgentTask } from "./types";

type Lease = { _id: string; token: string; taskId: string; expiresAt: string };
const duration = 90_000;
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const keyFor = (task: ProjectAgentTask) => createHash("sha256").update(JSON.stringify([task.projectId, task.conversationId])).digest("hex");

/** Experimental cross-worker serialization for a single chat and its shared Dify/sandbox state. */
export async function withConversationLease<T>(task: ProjectAgentTask, controller: AbortController, work: () => Promise<T>): Promise<T> {
  if (process.env.PROJECT_AGENT_SERIALIZE_CONVERSATIONS !== "1" || !task.conversationId) return work();
  const db = await getMongoAiDb(), leases = db.collection<Lease>("projectAgentConversationLeases");
  const key = keyFor(task), token = randomUUID();
  let lastTouch = Date.now();
  while (!controller.signal.aborted) {
    try {
      await leases.insertOne({ _id: key, token, taskId: task.id, expiresAt: iso(Date.now() + duration) });
      break;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    const held = await leases.findOne({ _id: key });
    if (held && held.expiresAt <= iso()) throw new Error("Previous conversation lease expired; inspect its task and external effects before recovery");
    const current = await readProjectAgentTask(task.id);
    if (!current || current.cancelled || current.status !== "queued") throw new Error("Waiting task was stopped or is no longer queued");
    if (Date.now() - lastTouch > 30_000) {
      await db.collection<{ _id: string; status: string; cancelled?: boolean; updatedAt: string }>("project_agent_tasks").updateOne({ _id: task.id, status: "queued", cancelled: { $ne: true } }, { $set: { updatedAt: iso() } });
      lastTouch = Date.now();
    }
    await delay(1000, undefined, { signal: controller.signal });
  }
  if (controller.signal.aborted) { await leases.deleteOne({ _id: key, token }).catch(() => {}); throw new Error("Task stopped while waiting for its conversation"); }
  let lastRenewed = Date.now();
  const heartbeat = setInterval(() => {
    void leases.updateOne({ _id: key, token, expiresAt: { $gt: iso() } }, { $set: { expiresAt: iso(Date.now() + duration) } })
      .then(result => { if (result.matchedCount) lastRenewed = Date.now(); else controller.abort(new Error("Conversation lease lost; inspect external effects before retrying")); })
      .catch(() => { if (Date.now() - lastRenewed > 45_000) controller.abort(new Error("Conversation lease renewal failed; inspect external effects before retrying")); });
  }, 20_000);
  heartbeat.unref?.();
  try { const result = await runWithConversationFence({ key, token }, work); if (controller.signal.aborted) throw controller.signal.reason ?? new Error("Task stopped"); return result; }
  finally { clearInterval(heartbeat); await leases.deleteOne({ _id: key, token }).catch(() => {}); }
}
