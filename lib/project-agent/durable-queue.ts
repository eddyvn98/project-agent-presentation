import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { readProjectAgentTask, updateProjectAgentTask } from "./task-store";

export type QueueState = "queued" | "running" | "done" | "failed" | "needs_review";
export interface QueueReceipt {
  taskId: string; state: QueueState; queuedAt: string;
  startedAt?: string; completedAt?: string; error?: string; attempt: number;
}
const valid = (id: string) => /^pat_[a-f0-9]{12}$/.test(id);
const root = () => {
  const base = process.env.PROJECT_AGENT_DURABLE_QUEUE_DIR ??
    (process.env.PROJECT_AGENT_SCHEDULES_DIR ? path.join(process.env.PROJECT_AGENT_SCHEDULES_DIR, "_queue") :
    path.join(process.cwd(), "data", "project-agent", "durable-queue"));
  const dir = path.resolve(base), work = path.resolve(process.cwd(), "data", "project-agent", "workspaces");
  if (dir === work || dir.startsWith(work + path.sep) || work.startsWith(dir + path.sep))
    throw new Error("Queue must not overlap Agent sandbox workspaces");
  if (process.env.NODE_ENV === "production" && !process.env.PROJECT_AGENT_DURABLE_QUEUE_DIR &&
    !process.env.PROJECT_AGENT_SCHEDULES_DIR) throw new Error("Configure shared durable queue storage");
  return dir;
};
function fileOf(id: string) {
  if (!valid(id)) throw new Error("Invalid queued task ID");
  return path.join(root(), id + ".json");
}
async function privateRoot() { await fs.mkdir(root(), { recursive: true, mode: 0o700 }); }
async function persist(item: QueueReceipt) {
  const dest = fileOf(item.taskId), tmp = dest + "." + randomUUID() + ".tmp";
  try {
    await fs.writeFile(tmp, JSON.stringify(item), { flag: "wx", mode: 0o600 });
    await fs.rename(tmp, dest);
  } finally { await fs.unlink(tmp).catch(() => {}); }
}
export async function readQueueReceipt(id: string): Promise<QueueReceipt | null> {
  try {
    const item = JSON.parse(await fs.readFile(fileOf(id), "utf8")) as QueueReceipt;
    if (item.taskId !== id || !["queued","running","done","failed","needs_review"].includes(item.state))
      throw new Error("Queue receipt is corrupt");
    return item;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
export async function enqueueDurableTask(id: string): Promise<QueueReceipt> {
  if (!await readProjectAgentTask(id)) throw new Error("Cannot queue a task that does not exist");
  await privateRoot();
  const receipt: QueueReceipt = { taskId: id, state: "queued", queuedAt: new Date().toISOString(), attempt: 0 };
  try { await fs.writeFile(fileOf(id), JSON.stringify(receipt), { flag: "wx", mode: 0o600 }); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
  return (await readQueueReceipt(id))!;
}
/** A live worker keeps this atomic directory lease fresh. No unsafe steal after crash. */
export async function withDurableTaskLease(id: string, work: () => Promise<void>): Promise<boolean> {
  const lock = fileOf(id) + ".lease";
  try { await fs.mkdir(lock, { mode: 0o700 }); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") return false; throw e; }
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    const existing = await readQueueReceipt(id);
    if (!existing || existing.state !== "queued") return false;
    const task = await readProjectAgentTask(id);
    if (!task || task.status === "failed" || task.status === "done" || task.cancelled) {
      await persist({ ...existing, state: task?.status === "done" ? "done" : "failed", completedAt: new Date().toISOString() });
      return false;
    }
    await persist({ ...existing, state: "running", startedAt: new Date().toISOString(), attempt: existing.attempt + 1 });
    heartbeat = setInterval(() => { void fs.utimes(lock, new Date(), new Date()).catch(() => {}); }, 15_000);
    heartbeat.unref?.();
    try { await work(); }
    catch (cause) { await persist({ ...existing, state: "needs_review", attempt: existing.attempt + 1,
      startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
      error: cause instanceof Error ? cause.message.slice(0, 200) : "Worker failed" }); throw cause; }
    const completed = await readProjectAgentTask(id);
    await persist({ ...existing, state: completed?.status === "done" ? "done" : "failed",
      attempt: existing.attempt + 1, startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(), error: completed?.error?.slice(0, 200) });
    return true;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    await fs.rm(lock, { recursive: true, force: true });
  }
}
/** Returns queued IDs only. An uncertain running task is never replayed automatically. */
export async function scanDurableQueue(limit = 100): Promise<{ queued: string[]; uncertain: number }> {
  await privateRoot();
  const files = await fs.readdir(root());
  const queued: string[] = [];
  let uncertain = 0;
  for (const name of files.filter(f => /^pat_[a-f0-9]{12}\.json$/.test(f)).slice(-2000)) {
    const id = name.slice(0, -5), entry = await readQueueReceipt(id);
    if (!entry) continue;
    if (entry.state === "queued" && queued.length < limit) queued.push(id);
    if (entry.state === "running" && Date.now() - Date.parse(entry.startedAt ?? entry.queuedAt) > 45 * 60_000) {
      const lock = fileOf(id) + ".lease";
      const st = await fs.stat(lock).catch(() => null);
      if (!st || Date.now() - st.mtimeMs > 90_000) {
        const task = await readProjectAgentTask(id);
        await persist({ ...entry, state: task?.status === "done" ? "done" : "needs_review",
          completedAt: new Date().toISOString(),
          error: "Worker lease expired; review side effects before retry" });
        if (task && (task.status === "queued" || task.status === "running")) {
          await updateProjectAgentTask(id, { status: "failed", completedAt: new Date().toISOString(),
            error: "Worker lease expired; inspect external side effects before retrying.",
            logLine: "failed: durable queue needs human review" }).catch(() => {});
        }
        uncertain++;
      }
    }
  }
  return { queued, uncertain };
}
