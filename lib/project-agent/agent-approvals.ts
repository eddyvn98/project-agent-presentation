import { createHash } from "node:crypto";
import { getMongoAiDb } from "@/services/mongodb/client";

export interface AgentApproval {
  id: string; owner: string; projectId: string; taskId: string; host: string;
  intent: string; state: "pending" | "approved" | "rejected" | "used" | "expired";
  createdAt: string; expiresAt: string; decidedAt?: string;
}
interface Stored extends AgentApproval { _id: string; purgeAt?: Date }
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const ownerId = (email: string) => email.trim().toLowerCase();
const validId = (id: string) => /^apa_[a-f0-9]{40}$/.test(id);
let indexes: Promise<unknown> | undefined;
async function coll() {
  const db = await getMongoAiDb();
  const collection = db.collection<Stored>("projectAgentApprovals");
  if (!indexes) indexes = Promise.all([
    collection.createIndex({ owner: 1, createdAt: -1 }),
    collection.createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0 }),
  ]).catch(error => { indexes = undefined; throw error; });
  await indexes;
  return collection;
}
const visible = ({ _id: _internal, purgeAt: _purge, ...item }: Stored): AgentApproval => item;
export async function listAgentApprovals(owner: string): Promise<AgentApproval[]> {
  const email = ownerId(owner);
  const rows = await (await coll()).find({ owner: email })
    .sort({ createdAt: -1 }).limit(150).toArray();
  return rows.map(visible);
}
/** Atomic transition: only the authenticated owner can decide an unexpired pending request. */
export async function decideAgentApproval(owner: string, id: string, approve: boolean): Promise<AgentApproval> {
  if (!validId(id)) throw new Error("Invalid approval ID");
  const stamp = new Date().toISOString();
  const row = await (await coll()).findOneAndUpdate({
    _id: id, owner: ownerId(owner), state: "pending", expiresAt: { $gt: stamp },
  }, { $set: { state: approve ? "approved" : "rejected", decidedAt: stamp } },
  { returnDocument: "after" });
  if (!row) throw new Error("Approval no longer pending");
  return visible(row);
}
export async function requireAgentApproval(input: {
  owner: string; projectId: string; taskId: string; host: string;
  intent: string; scheduled: boolean;
}): Promise<{ allowed: boolean; message: string }> {
  if (input.scheduled) return { allowed: false, message: "Unattended tasks cannot approve high-impact actions" };
  const owner = ownerId(input.owner), intent = input.intent.trim().slice(0, 350);
  if (!owner.includes("@") || !input.projectId || !input.taskId ||
    !/^[a-z0-9.-]+$/i.test(input.host) || !intent)
    return { allowed: false, message: "Approval requires a verified owner and exact browser action" };
  const host = input.host.toLowerCase();
  const id = "apa_" + hash(JSON.stringify([owner, input.projectId, input.taskId, host, intent])).slice(0, 40);
  const collection = await coll(), now = Date.now(), stamp = new Date(now).toISOString();
  const row = await collection.findOneAndUpdate({
    _id: id, owner, state: "approved", expiresAt: { $gt: stamp },
  }, { $set: { state: "used", decidedAt: stamp } }, { returnDocument: "after" });
  if (row) return { allowed: true, message: "Approved for this single action" };
  const existing = await collection.findOne({ _id: id, owner });
  if (existing && Date.parse(existing.expiresAt) > now) {
    if (existing.state === "pending") return { allowed: false, message: "Waiting for approval in /account/agent-control (ID " + id + ")" };
    return { allowed: false, message: "This action was rejected or its one-time permission was consumed" };
  }
  const entry: Stored = { _id: id, id, owner, projectId: input.projectId,
    taskId: input.taskId, host, intent, state: "pending", createdAt: stamp,
    expiresAt: new Date(now + 15 * 60_000).toISOString(), purgeAt: new Date(now + 36 * 60_000) };
  const replaced = await collection.updateOne({ _id: id, owner,
    expiresAt: { $lte: stamp } }, { $set: entry });
  if (replaced.modifiedCount) {
    void import("./telegram-notifications").then(m =>
      m.sendTelegramAgentNotice(owner, "approval")).catch(() => {});
    return { allowed: false, message: "Owner approval required in /account/agent-control (ID " + id + ")" };
  }
  try {
    await collection.insertOne(entry);
    void import("./telegram-notifications").then(m =>
      m.sendTelegramAgentNotice(owner, "approval")).catch(() => {});
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  return { allowed: false, message: "Owner approval required in /account/agent-control (ID " + id + "). Never assume it was approved." };
}
