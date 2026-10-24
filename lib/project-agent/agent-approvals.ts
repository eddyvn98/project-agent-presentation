import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface AgentApproval {
  id: string; owner: string; projectId: string; taskId: string; host: string;
  intent: string; state: "pending" | "approved" | "rejected" | "used" | "expired";
  createdAt: string; expiresAt: string; decidedAt?: string;
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const root = () => path.resolve(process.env.PROJECT_AGENT_APPROVALS_DIR ??
  path.join(process.env.PROJECT_AGENT_SCHEDULES_DIR ?? path.join(process.cwd(), "data", "project-agent"), "_approvals"));
const folder = (owner: string) => path.join(root(), hash(owner.trim().toLowerCase()));
const file = (owner: string, id: string) => {
  if (!/^apa_[a-f0-9]{40}$/.test(id)) throw new Error("Invalid approval ID");
  return path.join(folder(owner), id + ".json");
};
async function save(item: AgentApproval) {
  const dest = file(item.owner, item.id);
  const tmp = dest + "." + randomUUID() + ".tmp";
  try { await fs.writeFile(tmp, JSON.stringify(item), { flag: "wx", mode: 0o600 }); await fs.rename(tmp, dest); }
  finally { await fs.unlink(tmp).catch(() => {}); }
}
async function read(owner: string, id: string): Promise<AgentApproval | null> {
  try {
    const item = JSON.parse(await fs.readFile(file(owner, id), "utf8")) as AgentApproval;
    return item.owner === owner.trim().toLowerCase() && item.id === id ? item : null;
  } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
async function exclusive<T>(owner: string, id: string, act: () => Promise<T>): Promise<T> {
  const lock = file(owner, id) + ".lock";
  await fs.mkdir(lock).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "EEXIST") throw new Error("Approval busy; retry");
    throw e;
  });
  try { return await act(); } finally { await fs.rmdir(lock).catch(() => {}); }
}
export async function listAgentApprovals(owner: string): Promise<AgentApproval[]> {
  const names = await fs.readdir(folder(owner)).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return [] as string[];
    throw e;
  });
  const all = await Promise.all(names.filter(n => /^apa_[a-f0-9]{40}\.json$/.test(n))
    .slice(-150).map(n => read(owner, n.slice(0, -5))));
  return all.filter((x): x is AgentApproval => !!x)
    .sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
export async function decideAgentApproval(owner: string, id: string, approve: boolean): Promise<AgentApproval> {
  return exclusive(owner, id, async () => {
    const item = await read(owner, id);
    if (!item || item.state !== "pending" || Date.parse(item.expiresAt) <= Date.now())
      throw new Error("Approval no longer pending");
    item.state = approve ? "approved" : "rejected";
    item.decidedAt = new Date().toISOString();
    await save(item);
    return item;
  });
}
/** One-time, exact-action authorization. Never inferred from model or web content. */
export async function requireAgentApproval(input: {
  owner: string; projectId: string; taskId: string; host: string;
  intent: string; scheduled: boolean;
}): Promise<{ allowed: boolean; message: string }> {
  if (input.scheduled) return { allowed: false, message: "Unattended tasks cannot perform high-impact actions" };
  const owner = input.owner.trim().toLowerCase(), intent = input.intent.trim().slice(0, 350);
  if (!owner || !input.projectId || !/^[-a-z0-9.]+$/i.test(input.host) || !intent)
    return { allowed: false, message: "Approval requires a verified task owner, project and web action" };
  const id = "apa_" + hash(JSON.stringify([owner, input.projectId, input.taskId, input.host, intent])).slice(0, 40);
  await fs.mkdir(folder(owner), { recursive: true, mode: 0o700 });
  return exclusive(owner, id, async () => {
    const existing = await read(owner, id);
    const now = Date.now();
    if (existing?.state === "approved" && Date.parse(existing.expiresAt) > now) {
      await save({ ...existing, state: "used", decidedAt: new Date().toISOString() });
      return { allowed: true, message: "Approved once" };
    }
    if (existing?.state === "pending" && Date.parse(existing.expiresAt) > now)
      return { allowed: false, message: "Waiting for owner approval in /account/agent-control (ID " + id + "). Ask the user to approve, then retry the action." };
    if (existing?.state === "rejected" && Date.parse(existing.expiresAt) > now)
      return { allowed: false, message: "The owner rejected this action" };
    const entry: AgentApproval = { id, owner, projectId: input.projectId, taskId: input.taskId,
      host: input.host, intent, state: "pending", createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 15 * 60_000).toISOString() };
    await save(entry);
    return { allowed: false, message: "Owner approval required in /account/agent-control (ID " + id + "). Do not repeat until approved." };
  });
}
