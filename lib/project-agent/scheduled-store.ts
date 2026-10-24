import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { nextScheduledRun, parseScheduleSpec } from "./scheduled-time";
import type { ScheduledAgentTask, ScheduleCreation, ScheduleRun } from "./scheduled-types";

const MAX_PER_USER = 100, MAX_RUNS = 20;
const hash = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
const validId = (id: string) => /^sat_[0-9a-f-]{36}$/.test(id);
function root() {
  const dir = path.resolve(process.env.PROJECT_AGENT_SCHEDULES_DIR ??
    path.join(process.cwd(), "data", "project-agent", "schedules"));
  const workspace = path.resolve(process.cwd(), "data", "project-agent", "workspaces");
  if (dir === workspace || dir.startsWith(workspace + path.sep) ||
    workspace.startsWith(dir + path.sep) || dir === process.cwd())
    throw new Error("Schedules directory must be isolated from sandbox workspaces");
  if (process.env.NODE_ENV === "production" && !process.env.PROJECT_AGENT_SCHEDULES_DIR)
    throw new Error("Configure a shared durable PROJECT_AGENT_SCHEDULES_DIR");
  return dir;
}
function userDir(owner: string) { return path.join(root(), hash(owner)); }
function scheduleFile(owner: string, id: string) {
  if (!validId(id)) throw new Error("Invalid schedule ID");
  return path.join(userDir(owner), id + ".json");
}
async function privateDir(dir: string) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Invalid schedule directory");
}
async function writeSchedule(item: ScheduledAgentTask) {
  const dest = scheduleFile(item.ownerEmail, item.id);
  const tmp = dest + "." + randomUUID() + ".tmp";
  try {
    await fs.writeFile(tmp, JSON.stringify(item), { flag: "wx", mode: 0o600 });
    await fs.rename(tmp, dest);
  } finally { await fs.unlink(tmp).catch(() => {}); }
}
async function readFile(file: string): Promise<ScheduledAgentTask | null> {
  try {
    const entry = JSON.parse(await fs.readFile(file, "utf8")) as ScheduledAgentTask;
    if (!validId(entry.id) || !entry.ownerEmail) return null;
    return entry;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
export async function getSchedule(owner: string, id: string) {
  if (!validId(id)) return null;
  const item = await readFile(scheduleFile(owner, id));
  return item?.ownerEmail.toLowerCase() === owner.trim().toLowerCase() ? item : null;
}
export async function listSchedules(owner: string): Promise<ScheduledAgentTask[]> {
  const dir = userDir(owner);
  const files = await fs.readdir(dir).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return [] as string[];
    throw e;
  });
  const all = await Promise.all(files.filter(name => /^sat_[0-9a-f-]{36}\.json$/.test(name))
    .slice(0, MAX_PER_USER + 1).map(name => readFile(path.join(dir, name))));
  return all.filter((item): item is ScheduledAgentTask =>
    Boolean(item && item.ownerEmail.toLowerCase() === owner.trim().toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function sanitize(owner: string, input: ScheduleCreation) {
  const title = input.title?.trim(), prompt = input.prompt?.trim();
  if (!title || title.length > 140 || !prompt || prompt.length > 6_000 ||
    !input.projectId || input.projectId.length > 180)
    throw new Error("A title, Project destination and a task prompt are required");
  if (input.workflowId && !/^awf_[0-9a-f-]{36}$/.test(input.workflowId)) throw new Error("Invalid workflow for schedule");
  const spec = parseScheduleSpec(input.spec);
  if (input.workflowId && spec.kind === "watch") throw new Error("Website-change schedules cannot directly launch workflows");
  const next = nextScheduledRun(spec);
  if (!next) throw new Error("The requested schedule is already in the past");
  return { title, prompt, spec, next };
}
export async function createSchedule(owner: string, input: ScheduleCreation, pending = false) {
  const { title, prompt, spec, next } = sanitize(owner, input);
  await privateDir(root()); await privateDir(userDir(owner));
  const existing = await listSchedules(owner);
  if (existing.length >= MAX_PER_USER) throw new Error("Maximum 100 schedules per account");
  const identical = existing.find(item => item.status === (pending ? "pending" : "active") && item.projectId === input.projectId &&
    item.prompt === prompt && item.workflowId === input.workflowId && JSON.stringify(item.spec) === JSON.stringify(spec) &&
    Date.now() - Date.parse(item.createdAt) < 120_000);
  if (identical) return identical; // Prevent retry storms from making duplicate reminders.
  const now = new Date().toISOString();
  const schedule: ScheduledAgentTask = { id: "sat_" + randomUUID(),
    ownerEmail: owner.trim().toLowerCase(), projectId: input.projectId, title, prompt, workflowId: input.workflowId,
    spec, nextRunAt: next, status: pending ? "pending" : "active", runs: [], createdAt: now, updatedAt: now };
  await writeSchedule(schedule);
  return schedule;
}
async function locked<T>(owner: string, id: string, fn: () => Promise<T>): Promise<T> {
  const dir = scheduleFile(owner, id) + ".lock";
  try { await fs.mkdir(dir, { mode: 0o700 }); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    const st = await fs.stat(dir).catch(() => null);
    if (!st || Date.now() - st.mtimeMs < 120_000) throw new Error("Schedule is busy");
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { mode: 0o700 });
  }
  try { return await fn(); }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
}
export async function updateSchedule(owner: string, id: string,
  change: { action: "approve" | "approve_action" | "reject_action" | "suggest_pause" | "suggest_resume" | "suggest_delete" | "pause" | "resume" | "delete" | "edit"; title?: string;
    prompt?: string; spec?: ScheduleCreation["spec"]; projectId?: string; workflowId?: string }) {
  return locked(owner, id, async () => {
    const item = await getSchedule(owner, id);
    if (!item) throw new Error("Schedule not found");
    if (change.action.startsWith("suggest_")) {
      if (item.status === "pending") throw new Error("Approve the new schedule before requesting modifications");
      item.pendingAction = change.action.slice("suggest_".length) as "pause" | "resume" | "delete";
    }
    if (change.action === "reject_action") item.pendingAction = undefined;
    if (change.action === "approve_action") {
      const pending = item.pendingAction;
      if (!pending) throw new Error("No proposed schedule change");
      item.pendingAction = undefined;
      if (pending === "delete") { await fs.unlink(scheduleFile(owner, id)); return null; }
      if (pending === "pause") item.status = "paused";
      if (pending === "resume") {
        item.nextRunAt = nextScheduledRun(item.spec);
        item.status = item.nextRunAt ? "active" : "completed";
      }
    }
    if (change.action === "delete") { await fs.unlink(scheduleFile(owner, id)); return null; }
    if (change.action === "approve") {
      if (item.status !== "pending") throw new Error("This schedule is not awaiting approval");
      const next = nextScheduledRun(item.spec);
      if (!next) throw new Error("The proposed run time has expired; edit this schedule first");
      item.status = "active"; item.nextRunAt = next;
    }
    if (change.action === "pause") item.status = "paused";
    if (change.action === "resume") {
      if (item.status === "pending") throw new Error("Approve the proposal first");
      item.nextRunAt = nextScheduledRun(item.spec);
      item.status = item.nextRunAt ? "active" : "completed";
    }
    if (change.action === "edit") {
      const next = sanitize(owner, { projectId: change.projectId ?? item.projectId,
        title: change.title ?? item.title, prompt: change.prompt ?? item.prompt,
        spec: change.spec ?? item.spec, workflowId: change.workflowId ?? item.workflowId });
      Object.assign(item, { ...next, nextRunAt: next.next, projectId: change.projectId ?? item.projectId });
      if (change.workflowId !== undefined) item.workflowId = change.workflowId || undefined;
      item.status = "active";
    }
    item.updatedAt = new Date().toISOString();
    await writeSchedule(item);
    return item;
  });
}
export async function listDueSchedules(at = Date.now(), limit = 20) {
  const dirs = await fs.readdir(root(), { withFileTypes: true }).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return [] as import("node:fs").Dirent[];
    throw e;
  });
  const due: ScheduledAgentTask[] = [];
  for (const dir of dirs) {
    if (!dir.isDirectory() || !/^[0-9a-f]{64}$/.test(dir.name)) continue;
    const files = await fs.readdir(path.join(root(), dir.name));
    for (const name of files) {
      if (!/^sat_[0-9a-f-]{36}\.json$/.test(name)) continue;
      const item = await readFile(path.join(root(), dir.name, name));
      if (item && hash(item.ownerEmail) === dir.name && item.status === "active" &&
        item.nextRunAt && Date.parse(item.nextRunAt) <= at) due.push(item);
      if (due.length >= limit) return due.sort((a,b) => a.nextRunAt!.localeCompare(b.nextRunAt!));
    }
  }
  return due.sort((a,b) => a.nextRunAt!.localeCompare(b.nextRunAt!));
}
export async function claimScheduleRun(owner: string, id: string, manual = false) {
  return locked(owner, id, async () => {
    const item = await getSchedule(owner, id);
    if (item) { for (const stale of item.runs.filter(run => run.status === "dispatching" && Date.now() - Date.parse(run.createdAt) > 600_000)) { stale.status = "failed"; stale.completedAt = new Date().toISOString(); stale.error = "Dispatch interrupted; inspect task history before rescheduling."; } }
    if (!item || item.status !== "active" || (!manual &&
      (!item.nextRunAt || Date.parse(item.nextRunAt) > Date.now()))) return null;
    if (item.runs.some(r => r.status === "dispatching" || r.status === "queued" || r.status === "running"))
      return null; // No concurrent run of the same automation.
    const occurrence = manual ? new Date().toISOString() : item.nextRunAt!;
    const run: ScheduleRun = { occurrence, status: "dispatching", createdAt: new Date().toISOString() };
    item.runs = [...item.runs, run].slice(-MAX_RUNS);
    item.lastRunAt = occurrence;
    if (!manual) {
      item.nextRunAt = nextScheduledRun(item.spec, Math.max(Date.parse(occurrence) + 60_000, Date.now()));
      if (!item.nextRunAt) item.status = "completed";
    }
    item.updatedAt = new Date().toISOString();
    await writeSchedule(item);
    return { item, run };
  });
}
export async function markScheduleRun(owner: string, id: string, occurrence: string,
  fields: Pick<ScheduleRun, "status"> & Partial<Pick<ScheduleRun, "taskId" | "workflowRunId" | "error" | "completedAt" | "resultDigest" | "sourceDigest" | "changed" | "summary" | "acknowledgedAt">>) {
  return locked(owner, id, async () => {
    const item = await getSchedule(owner, id);
    const run = item?.runs.find(value => value.occurrence === occurrence);
    if (!item || !run) return;
    Object.assign(run, fields);
    item.updatedAt = new Date().toISOString();
    await writeSchedule(item);
  });
}

/** Includes one-time schedules, which are no longer due but may have unfinished runs. */
export async function listSchedulesNeedingReconciliation(limit = 150): Promise<ScheduledAgentTask[]> {
  const directories = await fs.readdir(root(), { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [] as import("node:fs").Dirent[];
    throw error;
  });
  const found: ScheduledAgentTask[] = [];
  for (const directory of directories) {
    if (!directory.isDirectory() || !/^[a-f0-9]{64}$/.test(directory.name)) continue;
    const names = await fs.readdir(path.join(root(), directory.name));
    for (const name of names) {
      if (!/^sat_[a-f0-9-]{36}\.json$/.test(name)) continue;
      const item = await readFile(path.join(root(), directory.name, name));
      if (item && hash(item.ownerEmail) === directory.name &&
        item.runs.some(run => ["queued","running","dispatching"].includes(run.status)))
        found.push(item);
      if (found.length >= limit) return found;
    }
  }
  return found;
}
/** Single co-operating cron owner across shared POSIX filesystem workers. */
export async function withSchedulerTickLease<T>(fn: () => Promise<T>): Promise<T | null> {
  await privateDir(root());
  const lock = path.join(root(), ".scheduler-tick.lock");
  try { await fs.mkdir(lock, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const stat = await fs.stat(lock).catch(() => null);
    if (!stat || Date.now() - stat.mtimeMs < 300_000) return null;
    await fs.rm(lock, { recursive: true, force: true });
    try { await fs.mkdir(lock, { mode: 0o700 }); } catch { return null; }
  }
  try { return await fn(); }
  finally { await fs.rm(lock, { recursive: true, force: true }); }
}
export async function acknowledgeScheduleRun(owner: string, id: string, occurrence: string) {
  return locked(owner, id, async () => {
    const schedule = await getSchedule(owner, id);
    const run = schedule?.runs.find(r => r.occurrence === occurrence);
    if (!schedule || !run || !["done","failed"].includes(run.status)) throw new Error("Notification not found");
    run.acknowledgedAt = new Date().toISOString();
    await writeSchedule(schedule);
    return run;
  });
}

/** Retain last successfully processed website fingerprint across agent tasks and server restarts. */
export async function setScheduleWatchDigest(owner: string, id: string, digest: string): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid watch digest");
  await locked(owner, id, async () => {
    const item = await getSchedule(owner, id);
    if (!item || item.spec.kind !== "watch") return;
    item.watchDigest = digest; item.updatedAt = new Date().toISOString();
    await writeSchedule(item);
  });
}
