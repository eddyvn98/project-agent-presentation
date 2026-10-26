import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface AutoSkill {
  id: string; sourceId: string; title: string; description: string;
  instructions: string; files: Record<string, string>; revision: string;
}
export interface AutoSkillEntry {
  fileId: string; name: string; revision: string;
  status: "pending" | "running" | "ready" | "failed";
  attempts: number; nextRetryAt?: number; startedAt?: number;
  skill?: AutoSkill; error?: string;
}
interface Registry { projectId: string; ownerEmail: string; entries: AutoSkillEntry[] }
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const norm = (email: string) => email.trim().toLowerCase();

function root() {
  const configured = process.env.PROJECT_AGENT_AUTO_SKILLS_DIR;
  if (process.env.NODE_ENV === "production" && !configured)
    throw new Error("PROJECT_AGENT_AUTO_SKILLS_DIR must be persistent in production");
  const dir = path.resolve(configured || path.join(process.cwd(), "data/project-agent/auto-skills"));
  const work = path.resolve(process.cwd(), "data/project-agent/workspaces");
  if (dir === work || dir.startsWith(work + path.sep) || work.startsWith(dir + path.sep))
    throw new Error("Auto Skill Registry must stay outside task sandboxes");
  return dir;
}
function registryPath(projectId: string, ownerEmail: string) {
  if (!projectId || !norm(ownerEmail).includes("@")) throw new Error("Invalid Project identity");
  return path.join(root(), digest(norm(ownerEmail) + ":" + projectId) + ".json");
}
const blank = (projectId: string, ownerEmail: string): Registry =>
  ({ projectId, ownerEmail: norm(ownerEmail), entries: [] });
async function read(file: string): Promise<Registry | null> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as Registry; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
export async function listAutoSkillEntries(projectId: string, ownerEmail: string) {
  const stored = await read(registryPath(projectId, ownerEmail));
  return stored?.projectId === projectId && stored.ownerEmail === norm(ownerEmail)
    && Array.isArray(stored.entries) ? stored.entries : [];
}
async function transaction<T>(projectId: string, ownerEmail: string, act: (state: Registry) => T): Promise<T> {
  const file = registryPath(projectId, ownerEmail), lock = file + ".lock";
  await fs.mkdir(root(), { recursive: true, mode: 0o700 });
  let acquired = false;
  for (let turn = 0; turn < 30; turn++) {
    try { await fs.mkdir(lock, { mode: 0o700 }); acquired = true; break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const stat = await fs.stat(lock).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > 180_000)
        await fs.rmdir(lock).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 60));
    }
  }
  if (!acquired) throw new Error("Auto Skill Registry is busy");
  try {
    const state = await read(file) ?? blank(projectId, ownerEmail);
    if (state.projectId !== projectId || state.ownerEmail !== norm(ownerEmail))
      throw new Error("Auto Skill Registry scope mismatch");
    const value = act(state);
    const temporary = file + "." + randomUUID() + ".tmp";
    try {
      await fs.writeFile(temporary, JSON.stringify(state), { flag: "wx", mode: 0o600 });
      await fs.rename(temporary, file);
    } finally { await fs.rm(temporary, { force: true }); }
    return value;
  } finally { await fs.rmdir(lock).catch(() => {}); }
}
export async function queueAutoSkillSource(projectId: string, ownerEmail: string,
  fileId: string, name: string, revision: string): Promise<void> {
  if (!/^kf_[a-z0-9]{7,32}$/i.test(fileId)) return;
  await transaction(projectId, ownerEmail, state => {
    const entry = state.entries.find(x => x.fileId === fileId);
    if (entry?.revision === revision) return;
    const next: AutoSkillEntry = { fileId, name: name.slice(0, 180), revision,
      status: "pending", attempts: 0 };
    if (entry) state.entries[state.entries.indexOf(entry)] = next;
    else state.entries.push(next);
  });
}
export async function removeAutoSkillSource(projectId: string, ownerEmail: string, fileId: string) {
  await transaction(projectId, ownerEmail, state => {
    state.entries = state.entries.filter(x => x.fileId !== fileId);
  });
}
export async function claimAutoSkill(projectId: string, ownerEmail: string, fileId: string) {
  return transaction(projectId, ownerEmail, state => {
    const entry = state.entries.find(x => x.fileId === fileId);
    if (!entry) return null;
    if (entry.status === "running" && Date.now() - (entry.startedAt ?? 0) < 180_000)
      return null;
    if (entry.status === "ready" || (entry.nextRetryAt ?? 0) > Date.now()) return null;
    entry.status = "running"; entry.startedAt = Date.now();
    entry.attempts += 1;
    return { ...entry };
  });
}
export async function completeAutoSkill(projectId: string, ownerEmail: string, fileId: string,
  revision: string, skill: AutoSkill | null, error = "") {
  await transaction(projectId, ownerEmail, state => {
    const entry = state.entries.find(x => x.fileId === fileId);
    if (!entry || entry.revision !== revision || entry.status !== "running") return;
    entry.startedAt = undefined;
    if (skill) { entry.skill = skill; entry.status = "ready"; entry.error = undefined; entry.nextRetryAt = undefined; }
    else {
      entry.status = "failed"; entry.error = error.slice(0, 180);
      entry.nextRetryAt = Date.now() + Math.min(3_600_000, 30_000 * 2 ** Math.min(entry.attempts, 7));
    }
  });
}
export async function dueAutoSkillJobs(limit = 2) {
  const names = await fs.readdir(root()).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return [] as string[];
    throw e;
  });
  const jobs: { projectId: string; ownerEmail: string; fileId: string }[] = [];
  for (const name of names.filter(x => /^[a-f0-9]{64}\.json$/.test(x))) {
    const state = await read(path.join(root(), name)).catch(() => null);
    if (!state?.ownerEmail || !state.projectId || !Array.isArray(state.entries)) continue;
    for (const entry of state.entries) {
      if (entry.status === "ready" || (entry.nextRetryAt ?? 0) > Date.now()) continue;
      if (entry.status === "running" && Date.now() - (entry.startedAt ?? 0) < 180_000) continue;
      jobs.push({ ownerEmail: state.ownerEmail, projectId: state.projectId, fileId: entry.fileId });
      if (jobs.length >= limit) return jobs;
    }
  }
  return jobs;
}
