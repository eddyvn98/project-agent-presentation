import { getMongoAiDb } from "@/services/mongodb/client";
import type { ProjectAgentTask } from "./types";

interface Signal {
  _id: string; ownerEmail: string; projectId: string; createdAt: Date;
  prompt: string; userPrompt?: string;
}
let indexes: Promise<unknown> | null = null;
async function collection() {
  const db = await getMongoAiDb();
  const coll = db.collection<Signal>("projectAgentProactiveSignals");
  if (!indexes) indexes = Promise.all([
    coll.createIndex({ ownerEmail: 1, createdAt: -1 }),
    coll.createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 }),
  ]).catch(error => { indexes = null; throw error; });
  await indexes;
  return coll;
}
const sensitive = /(password|otp|secret|token|credit.?card|bank|transfer|mật khẩu|mã otp|chuyển khoản|thanh toán)/iu;
export async function recordProactiveSignal(task: ProjectAgentTask) {
  if (task.status !== "done" || task.scheduleRunId || task.workflowRunId ||
    !task.ownerEmail?.includes("@") || !task.projectId) return;
  const prompt = (task.userPrompt ?? task.prompt).trim();
  if (prompt.length < 16 || prompt.length > 1000 || sensitive.test(prompt)) return;
  await (await collection()).updateOne({ _id: task.id }, { $setOnInsert: {
    _id: task.id, ownerEmail: task.ownerEmail.trim().toLowerCase(),
    projectId: task.projectId, prompt: prompt.slice(0, 1000),
    userPrompt: prompt.slice(0, 1000), createdAt: new Date(task.createdAt),
  } }, { upsert: true });
}
export async function readProactiveSignals(ownerEmail: string): Promise<ProjectAgentTask[]> {
  const earliest = new Date(Date.now() - 45 * 86400000);
  const rows = await (await collection()).find({
    ownerEmail: ownerEmail.trim().toLowerCase(), createdAt: { $gte: earliest },
  }).sort({ createdAt: -1 }).limit(250).toArray();
  return rows.map(r => ({ id: r._id, ownerEmail: r.ownerEmail, projectId: r.projectId,
    prompt: r.prompt, userPrompt: r.userPrompt, createdAt: r.createdAt.toISOString(),
    updatedAt: r.createdAt.toISOString(), status: "done" as const, log: [] }));
}
export async function listProactiveSignalOwners() {
  const cutoff = new Date(Date.now() - 45 * 86400000);
  const owners = await (await collection()).distinct("ownerEmail", { createdAt: { $gte: cutoff } });
  return owners.filter((email): email is string => typeof email === "string").slice(0, 500);
}
