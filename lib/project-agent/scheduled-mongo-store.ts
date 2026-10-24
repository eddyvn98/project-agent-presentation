import { createHash, randomUUID } from "node:crypto";
import { getMongoAiDb } from "@/services/mongodb/client";
import { nextScheduledRun, parseScheduleSpec } from "./scheduled-time";
import type { ScheduleCreation, ScheduledAgentTask, ScheduleRun } from "./scheduled-types";

type Stored = ScheduledAgentTask & {
  _id: string; revision: number; activeRun?: string; dedupeKey: string;
};
type Change = { action: "approve" | "approve_action" | "reject_action" |
  "suggest_pause" | "suggest_resume" | "suggest_delete" | "pause" | "resume" | "delete" | "edit";
  title?: string; prompt?: string; spec?: ScheduleCreation["spec"];
  projectId?: string; workflowId?: string };
type RunFields = Pick<ScheduleRun, "status"> & Partial<Omit<ScheduleRun, "status" | "occurrence">>;
const ownerId = (value: string) => {
  const email = value.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Authenticated account required");
  return email;
};
const validId = (id: string) => /^sat_[0-9a-f-]{36}$/.test(id);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
let prepared: Promise<void> | null = null;
async function collection() {
  const db = await getMongoAiDb();
  const coll = db.collection<Stored>("projectAgentSchedules");
  if (!prepared) prepared = Promise.all([
    coll.createIndex({ ownerEmail: 1, createdAt: -1 }),
    coll.createIndex({ status: 1, nextRunAt: 1, activeRun: 1 }),
    coll.createIndex({ ownerEmail: 1, dedupeKey: 1 }, { unique: true }),
  ]).then(() => {});
  await prepared.catch(error => { prepared = null; throw error; });
  return coll;
}
const publicSchedule = (value: Stored): ScheduledAgentTask => {
  const { _id: _id, revision: _revision, activeRun: _run, dedupeKey: _key, ...record } = value;
  return record;
};
function sanitized(input: ScheduleCreation) {
  const title = input.title?.trim(), prompt = input.prompt?.trim();
  if (!title || title.length > 140 || !prompt || prompt.length > 6000 ||
    !input.projectId || input.projectId.length > 180) throw new Error("Title, prompt and Project are required");
  if (input.workflowId && !/^awf_[0-9a-f-]{36}$/.test(input.workflowId))
    throw new Error("Invalid workflow ID");
  const spec = parseScheduleSpec(input.spec);
  if (spec.kind === "watch" && input.workflowId) throw new Error("Watch schedules cannot launch workflows");
  const nextRunAt = nextScheduledRun(spec);
  if (!nextRunAt) throw new Error("Schedule time has already passed");
  return { title, prompt, spec, nextRunAt };
}
export async function getSchedule(owner: string, id: string) {
  if (!validId(id)) return null;
  const row = await (await collection()).findOne({ _id: id, ownerEmail: ownerId(owner) });
  return row ? publicSchedule(row) : null;
}
export async function listSchedules(owner: string): Promise<ScheduledAgentTask[]> {
  const rows = await (await collection()).find({ ownerEmail: ownerId(owner) })
    .sort({ createdAt: -1 }).limit(101).toArray();
  return rows.map(publicSchedule);
}
export async function createSchedule(owner: string, input: ScheduleCreation, pending = false) {
  const account = ownerId(owner), value = sanitized(input), now = new Date().toISOString();
  const coll = await collection();
  if (await coll.countDocuments({ ownerEmail: account }, { limit: 101 }) >= 100)
    throw new Error("Account limit is 100 scheduled tasks");
  const dedupeKey = hash(JSON.stringify({
    projectId: input.projectId, prompt: value.prompt, workflowId: input.workflowId,
    spec: value.spec, pending, bucket: Math.floor(Date.now() / 120000),
  }));
  const record: Stored = {
    ...value, _id: "sat_" + randomUUID(), id: "", revision: 0, dedupeKey,
    ownerEmail: account, projectId: input.projectId, workflowId: input.workflowId,
    status: pending ? "pending" : "active", runs: [], createdAt: now, updatedAt: now,
  };
  record.id = record._id;
  try { await coll.insertOne(record); }
  catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const existing = await coll.findOne({ ownerEmail: account, dedupeKey });
    if (!existing) throw error;
    return publicSchedule(existing);
  }
  return publicSchedule(record);
}
async function atomic<T>(owner: string, id: string, edit: (row: Stored) =>
  { record?: Stored; deletion?: boolean; result: T }): Promise<T> {
  if (!validId(id)) throw new Error("Invalid schedule ID");
  const coll = await collection();
  for (let attempt = 0; attempt < 8; attempt++) {
    const previous = await coll.findOne({ _id: id, ownerEmail: ownerId(owner) });
    if (!previous) throw new Error("Schedule not found");
    const changed = edit({ ...previous, runs: previous.runs.map(r => ({ ...r })) });
    const filter = { _id: id, ownerEmail: ownerId(owner), revision: previous.revision };
    if (changed.deletion) {
      const removed = await coll.deleteOne(filter);
      if (removed.deletedCount) return changed.result;
    } else if (changed.record) {
      const replacement = { ...changed.record, revision: previous.revision + 1,
        updatedAt: new Date().toISOString() };
      if ((await coll.replaceOne(filter, replacement)).matchedCount) return changed.result;
    }
  }
  throw new Error("Schedule was edited concurrently; retry");
}
export async function updateSchedule(owner: string, id: string, change: Change) {
  return atomic<ScheduledAgentTask | null>(owner, id, row => {
    const act = change.action;
    if (act.startsWith("suggest_")) {
      if (row.status === "pending") throw new Error("Approve creation first");
      row.pendingAction = act.slice(8) as "pause" | "resume" | "delete";
    }
    if (act === "reject_action") row.pendingAction = undefined;
    if (act === "approve_action") {
      const pending = row.pendingAction;
      if (!pending) throw new Error("No change awaiting approval");
      row.pendingAction = undefined;
      if (pending === "delete") return { deletion: true, result: null };
      if (pending === "pause") row.status = "paused";
      if (pending === "resume") row.status = "active";
      if (pending === "resume") row.nextRunAt = nextScheduledRun(row.spec);
      if (!row.nextRunAt) row.status = "completed";
    }
    if (act === "delete") return { deletion: true, result: null };
    if (act === "approve") {
      if (row.status !== "pending") throw new Error("Not awaiting approval");
      row.nextRunAt = nextScheduledRun(row.spec);
      if (!row.nextRunAt) throw new Error("Proposed time expired; edit before approval");
      row.status = "active";
    }
    if (act === "pause") row.status = "paused";
    if (act === "resume") {
      if (row.status === "pending") throw new Error("Approve the proposal first");
      row.nextRunAt = nextScheduledRun(row.spec);
      row.status = row.nextRunAt ? "active" : "completed";
    }
    if (act === "edit") {
      const next = sanitized({ projectId: change.projectId ?? row.projectId,
        title: change.title ?? row.title, prompt: change.prompt ?? row.prompt,
        spec: change.spec ?? row.spec, workflowId: change.workflowId ?? row.workflowId });
      Object.assign(row, next, { projectId: change.projectId ?? row.projectId,
        workflowId: change.workflowId ?? row.workflowId, status: "active", pendingAction: undefined });
    }
    return { record: row, result: publicSchedule(row) };
  });
}
export async function listDueSchedules(at = Date.now(), limit = 20) {
  const rows = await (await collection()).find({
    status: "active", nextRunAt: { $lte: new Date(at).toISOString(), $ne: null },
    activeRun: { $exists: false },
  }).sort({ nextRunAt: 1 }).limit(limit).toArray();
  return rows.map(publicSchedule);
}
export async function listSchedulesNeedingReconciliation(limit = 150) {
  const rows = await (await collection()).find({ activeRun: { $exists: true } })
    .sort({ updatedAt: 1 }).limit(limit).toArray();
  return rows.map(publicSchedule);
}
export async function claimScheduleRun(owner: string, id: string, manual = false) {
  return atomic<{ item: ScheduledAgentTask; run: ScheduleRun } | null>(owner, id, row => {
    if (row.status !== "active" || row.activeRun ||
      (!manual && (!row.nextRunAt || Date.parse(row.nextRunAt) > Date.now())))
      return { record: row, result: null };
    const occurrence = manual ? new Date().toISOString() : row.nextRunAt!;
    const run: ScheduleRun = { occurrence, status: "dispatching", createdAt: new Date().toISOString() };
    row.runs = [...row.runs, run].slice(-20);
    row.activeRun = occurrence;
    row.lastRunAt = occurrence;
    if (!manual) {
      row.nextRunAt = nextScheduledRun(row.spec, Math.max(Date.now(), Date.parse(occurrence) + 60_000));
      if (!row.nextRunAt) row.status = "completed";
    }
    return { record: row, result: { item: publicSchedule(row), run } };
  });
}
export async function markScheduleRun(owner: string, id: string, occurrence: string, fields: RunFields) {
  return atomic<void>(owner, id, row => {
    const run = row.runs.find(r => r.occurrence === occurrence);
    if (!run) return { record: row, result: undefined };
    Object.assign(run, fields);
    if (["done", "failed"].includes(run.status) && row.activeRun === occurrence)
      delete row.activeRun;
    return { record: row, result: undefined };
  });
}
export async function setScheduleWatchDigest(owner: string, id: string, digest: string) {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid digest");
  return atomic<void>(owner, id, row => {
    if (row.spec.kind === "watch") row.watchDigest = digest;
    return { record: row, result: undefined };
  });
}
export async function acknowledgeScheduleRun(owner: string, id: string, occurrence: string) {
  return atomic<ScheduleRun>(owner, id, row => {
    const run = row.runs.find(r => r.occurrence === occurrence);
    if (!run || !["done","failed"].includes(run.status)) throw new Error("No completed notification");
    run.acknowledgedAt = new Date().toISOString();
    return { record: row, result: run };
  });
}
/** Each occurrence is CAS-claimed in Mongo. No global filesystem process lease is needed. */
export async function withSchedulerTickLease<T>(fn: () => Promise<T>): Promise<T> { return fn(); }
