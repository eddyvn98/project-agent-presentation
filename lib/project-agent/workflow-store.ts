import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { AgentWorkflow, AgentWorkflowRun, AgentWorkflowStep } from "./workflow-types";

const hash = (value: string) => createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
const valid = (id: string, prefix: "awf" | "awr") => new RegExp("^" + prefix + "_[0-9a-f-]{36}$").test(id);
function base() {
  const dir = path.resolve(process.env.PROJECT_AGENT_WORKFLOWS_DIR ??
    path.join(process.env.PROJECT_AGENT_SCHEDULES_DIR ?? path.join(process.cwd(), "data", "project-agent"), "_workflows"));
  const work = path.resolve(process.cwd(), "data", "project-agent", "workspaces");
  if (dir === work || dir.startsWith(work + path.sep) || work.startsWith(dir + path.sep))
    throw new Error("Workflow storage must not overlap sandbox workspaces");
  if (process.env.NODE_ENV === "production" && !process.env.PROJECT_AGENT_WORKFLOWS_DIR &&
      !process.env.PROJECT_AGENT_SCHEDULES_DIR)
    throw new Error("Configure durable workflow storage");
  return dir;
}
function ownerDir(owner: string) {
  if (!owner.includes("@")) throw new Error("Invalid owner identity");
  return path.join(base(), hash(owner));
}
function file(owner: string, id: string, kind: "awf" | "awr") {
  if (!valid(id, kind)) throw new Error("Invalid workflow ID");
  return path.join(ownerDir(owner), id + ".json");
}
async function init(owner: string) {
  await fs.mkdir(base(), { recursive: true, mode: 0o700 });
  await fs.mkdir(ownerDir(owner), { recursive: true, mode: 0o700 });
}
async function read<T>(target: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(target, "utf8")) as T; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
async function write(target: string, value: object) {
  const tmp = target + "." + randomUUID() + ".tmp";
  try { await fs.writeFile(tmp, JSON.stringify(value), { flag: "wx", mode: 0o600 }); await fs.rename(tmp, target); }
  finally { await fs.unlink(tmp).catch(() => {}); }
}
async function locked<T>(target: string, action: () => Promise<T>) {
  const lock = target + ".lock";
  try { await fs.mkdir(lock, { mode: 0o700 }); }
  catch { throw new Error("Workflow busy; retry"); }
  try { return await action(); } finally { await fs.rmdir(lock).catch(() => {}); }
}
function normalizeSteps(input: AgentWorkflowStep[]): AgentWorkflowStep[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 12)
    throw new Error("Workflow needs 1-12 steps");
  return input.map((step, i) => {
    const title = step.title?.trim(), prompt = step.prompt?.trim();
    if (!title || title.length > 100 || !prompt || prompt.length > 2400)
      throw new Error("Step " + (i + 1) + " needs a short title and task instruction");
    const route = step.route;
    if (route && (typeof route.contains !== "string" || !route.contains.trim() ||
      route.contains.length > 120 || ![route.onMatch, route.onOther].every(
        target => target === "next" || target === "stop" ||
          (typeof target === "string" && /^step_([1-9]|1[0-2])$/.test(target) &&
            Number(target.slice(5)) > i+1 && Number(target.slice(5)) <= input.length))))
      throw new Error("Conditional branches must target a later step, next, or stop");
    if (step.onFailure && !["stop","next"].includes(step.onFailure))
      throw new Error("Failure handling must be stop or continue");
    return { id: "step_" + (i + 1), title, prompt,
      requiresApproval: step.requiresApproval === true,
      ...(route ? { route: { contains: route.contains.trim(),
        onMatch: route.onMatch, onOther: route.onOther } } : {}),
      ...(step.onFailure ? { onFailure: step.onFailure } : {}),
    };
  });
}
export async function listAgentWorkflows(owner: string): Promise<AgentWorkflow[]> {
  const entries = await fs.readdir(ownerDir(owner)).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return [] as string[];
    throw e;
  });
  const records = await Promise.all(entries.filter(x => /^awf_[0-9a-f-]{36}\.json$/.test(x))
    .slice(0, 60).map(name => read<AgentWorkflow>(path.join(ownerDir(owner), name))));
  return records.filter((x): x is AgentWorkflow => Boolean(x && x.ownerEmail === owner.toLowerCase().trim()));
}
export async function getAgentWorkflow(owner: string, id: string) {
  if (!valid(id, "awf")) return null;
  const value = await read<AgentWorkflow>(file(owner, id, "awf"));
  return value?.ownerEmail === owner.toLowerCase().trim() ? value : null;
}
export async function saveAgentWorkflow(owner: string, input: {
  id?: string; projectId: string; title: string; description?: string;
  steps: AgentWorkflowStep[]; enabled?: boolean;
}) {
  const title = input.title?.trim(), description = input.description?.trim() ?? "";
  if (!title || title.length > 120 || description.length > 500 ||
      !input.projectId || input.projectId.length > 180) throw new Error("Invalid workflow fields");
  const steps = normalizeSteps(input.steps);
  await init(owner);
  // Serialize draft creation across requests, including separate workers sharing storage.
  if (!input.id) return locked(path.join(ownerDir(owner), "create"), async () => {
    const same = (await listAgentWorkflows(owner)).filter(w =>
      w.projectId === input.projectId && w.title.trim().toLowerCase() === title.toLowerCase() && !w.enabled);
    if (same.length > 1) throw new Error("Ambiguous workflow drafts; select an explicit id");
    if (same.length === 1) return saveAgentWorkflow(owner, { ...input, id: same[0].id });
    if ((await listAgentWorkflows(owner)).length >= 50) throw new Error("Workflow limit reached");
    const now = new Date().toISOString();
    const record: AgentWorkflow = { id: "awf_" + randomUUID(),
      ownerEmail: owner.toLowerCase().trim(), projectId: input.projectId, title,
      description, steps, enabled: input.enabled ?? false, createdAt: now, updatedAt: now };
    const target = file(owner, record.id, "awf");
    await write(target, record);
    return record;
  });
  const existing = await getAgentWorkflow(owner, input.id);
  if (input.id && !existing) throw new Error("Workflow not found");
  if (!existing && (await listAgentWorkflows(owner)).length >= 50) throw new Error("Workflow limit reached");
  const now = new Date().toISOString();
  const record: AgentWorkflow = { id: existing?.id ?? "awf_" + randomUUID(),
    ownerEmail: owner.toLowerCase().trim(), projectId: input.projectId,
    title, description, steps, enabled: input.enabled ?? existing?.enabled ?? true,
    createdAt: existing?.createdAt ?? now, updatedAt: now };
  const target = file(owner, record.id, "awf");
  return locked(target, async () => { await write(target, record); return record; });
}
export async function changeAgentWorkflow(owner: string, id: string, action: "enable" | "disable" | "delete") {
  await init(owner);
  const target = file(owner, id, "awf");
  return locked(target, async () => {
    const record = await getAgentWorkflow(owner, id);
    if (!record) throw new Error("Workflow not found");
    if (action === "delete") { await fs.unlink(target); return null; }
    record.enabled = action === "enable"; record.updatedAt = new Date().toISOString();
    await write(target, record); return record;
  });
}
export async function getWorkflowRun(owner: string, id: string) {
  if (!valid(id, "awr")) return null;
  const run = await read<AgentWorkflowRun>(file(owner, id, "awr"));
  return run?.ownerEmail === owner.toLowerCase().trim() ? run : null;
}
export async function listWorkflowRuns(owner: string): Promise<AgentWorkflowRun[]> {
  const names = await fs.readdir(ownerDir(owner)).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return [] as string[];
    throw e;
  });
  const runs = await Promise.all(names.filter(n => /^awr_[0-9a-f-]{36}\.json$/.test(n)).slice(-120)
    .map(name => read<AgentWorkflowRun>(path.join(ownerDir(owner), name))));
  return runs.filter((r): r is AgentWorkflowRun => Boolean(r && r.ownerEmail === owner.toLowerCase().trim()))
    .sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
export async function createWorkflowRun(owner: string, workflow: AgentWorkflow) {
  await init(owner);
  const now = new Date().toISOString();
  const run: AgentWorkflowRun = { id: "awr_" + randomUUID(), workflowId: workflow.id,
    ownerEmail: owner.toLowerCase().trim(), projectId: workflow.projectId,
    steps: workflow.steps.map(s => ({ ...s })), index: 0, status: "ready",
    history: [], createdAt: now, updatedAt: now };
  await fs.writeFile(file(owner, run.id, "awr"), JSON.stringify(run), { flag: "wx", mode: 0o600 });
  return run;
}
export async function updateWorkflowRun(owner: string, id: string,
  action: (run: AgentWorkflowRun) => void) {
  const target = file(owner, id, "awr");
  return locked(target, async () => {
    const run = await getWorkflowRun(owner, id);
    if (!run) throw new Error("Workflow run not found");
    action(run);
    run.updatedAt = new Date().toISOString();
    await write(target, run);
    return run;
  });
}
export async function listRecoverableWorkflowRuns(limit = 60) {
  const dirs = await fs.readdir(base(), { withFileTypes: true }).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return [] as import("node:fs").Dirent[];
    throw e;
  });
  const runs: AgentWorkflowRun[] = [];
  for (const dir of dirs) {
    if (!dir.isDirectory() || !/^[0-9a-f]{64}$/.test(dir.name)) continue;
    const names = await fs.readdir(path.join(base(), dir.name));
    for (const name of names.filter(n => /^awr_[0-9a-f-]{36}\.json$/.test(n))) {
      const record = await read<AgentWorkflowRun>(path.join(base(), dir.name, name));
      if (record && hash(record.ownerEmail) === dir.name &&
        ["ready","running","dispatching"].includes(record.status)) runs.push(record);
      if (runs.length >= limit) return runs;
    }
  }
  return runs;
}
