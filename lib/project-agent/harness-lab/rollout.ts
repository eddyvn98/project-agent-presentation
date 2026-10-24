import { getMongoAiDb } from "@/services/mongodb/client";
import { harnessAssignment, harnessAddendum } from "./guard";
import { listHarnessVariants } from "./store";
import { isHarnessDeployed } from "./deployment";
import type { ProjectAgentTask } from "../types";

export function classifyHarnessDomain(request: string): string {
  const q = request.toLowerCase().slice(0, 1500);
  if (/\b(code|debug|javascript|typescript|python|repo|bug|git|compile)\b|lỗi code|mã nguồn/.test(q)) return "code";
  if (/\b(pdf|docx|pptx|xlsx|slide|document|report|presentation)\b|tài liệu|báo cáo|trình chiếu/.test(q)) return "documents";
  if (/\b(research|source|citation|compare|search|benchmark)\b|nguồn|nghiên cứu|so sánh/.test(q)) return "research";
  if (/\b(teach|student|learn|explain|lesson)\b|học sinh|giải thích|bài học/.test(q)) return "education";
  return "general";
}
export interface HarnessChoice { addendum: string; variantId: string; group: "trial" | "control" }
export async function selectHarnessForTask(task: ProjectAgentTask): Promise<HarnessChoice | null> {
  if (process.env.PROJECT_AGENT_HARNESS_LIVE !== "1" || task.scheduleRunId || task.workflowRunId) return null;
  const domain = classifyHarnessDomain(task.userPrompt ?? task.prompt);
  const variants = await listHarnessVariants(task.ownerEmail);
  const selected = variants.filter(v => (v.domain === domain || v.domain === "general") &&
    ["canary","active"].includes(v.status) && v.evidence?.improved);
  if (!selected.length) return null;
  // Do not inject multiple independent experiments into the same task.
  const ordered = selected.sort((a,b) => Number(b.domain===domain)-Number(a.domain===domain));
  let variant = ordered[0];
  for (const candidate of ordered) {
    if (await isHarnessDeployed(task.ownerEmail,candidate.domain,candidate.dimension,candidate.id)) {
      variant = candidate; break;
    }
  }
  if (!await isHarnessDeployed(task.ownerEmail,variant.domain,variant.dimension,variant.id)) return null;
  const isTrial = variant.status === "active" ||
    harnessAssignment(task.id, task.ownerEmail, variant.id) < variant.rolloutPercent;
  return { addendum: isTrial ? harnessAddendum(variant.domain, variant.dimension, variant.guidance) : "",
    variantId: variant.id, group: isTrial ? "trial" : "control" };
}
const field = (log: string, key: string) =>
  Number(log.match(new RegExp("(?:^| )" + key + "=(\\d+)"))?.[1] ?? 0);
export async function recordHarnessTaskOutcome(task: ProjectAgentTask) {
  if (!["done","failed"].includes(task.status)) return;
  const line = task.log.findLast(v => v.includes("harness_variant ::"));
  const match = line?.match(/harness_variant :: (hl_[0-9a-f-]{36}) (trial|control)/);
  if (!match) return;
  const metrics = task.log.findLast(v => v.includes("metrics ::")) ?? "";
  const db = await getMongoAiDb();
  const coll = db.collection("projectAgentHarnessOutcomes");
  await coll.updateOne({ _id: task.id }, { $setOnInsert: {
    _id: task.id, ownerEmail: task.ownerEmail.toLowerCase(), variantId: match[1],
    group: match[2], outcome: task.status, steps: field(metrics,"steps"),
    tokens: field(metrics,"prompt_tokens"), createdAt: task.completedAt ?? new Date().toISOString(),
  } }, { upsert: true });
  const versions = await listHarnessVariants(task.ownerEmail);
  const active = versions.find(v => v.id === match[1] && v.status === "canary");
  if (!active) return;
  const { harnessOutcomeTotals, changeHarnessRollout } = await import("./store");
  const totals = await harnessOutcomeTotals(task.ownerEmail, active.id);
  if (totals.trial.count >= 15 && totals.control.count >= 15 &&
    totals.trial.failed / totals.trial.count > totals.control.failed / totals.control.count + 0.10)
    await changeHarnessRollout(task.ownerEmail, active.id, "rollback");
}
