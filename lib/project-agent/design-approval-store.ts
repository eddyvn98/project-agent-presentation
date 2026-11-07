import { createHash, randomUUID } from "node:crypto";
import { getMongoAiDb } from "@/services/mongodb/client";
import { parseDesignSpec, type DesignSpec } from "@/lib/project-agent/runtime/design-model";
import { reviewDesign, type DesignReview } from "@/lib/project-agent/runtime/design-review";

export type DesignApprovalStatus = "needs_changes" | "awaiting_approval" | "approved" | "rejected";
export type DesignApprovalRecord = {
  id: string;
  projectId: string;
  taskId: string;
  sourceFileId: string;
  sha256: string;
  decision: "approved" | "rejected";
  reviewer: string;
  decidedAt: string;
  blockers: number;
  warnings: number;
};
type Stored = DesignApprovalRecord & { _id: string };
const MAX_BYTES = 100_000;
let indexes: Promise<unknown> | undefined;

async function collection() {
  const db = await getMongoAiDb();
  const rows = db.collection<Stored>("projectAgentDesignApprovals");
  if (!indexes) indexes = rows.createIndex(
    { projectId: 1, taskId: 1, sourceFileId: 1, sha256: 1, decidedAt: -1 },
  ).catch(error => { indexes = undefined; throw error; });
  await indexes;
  return rows;
}
export function inspectDesignApproval(bytes: Buffer):
  { spec: DesignSpec; sha256: string; review: DesignReview } | { error: string } {
  if (!bytes.length || bytes.length > MAX_BYTES) return { error: "Design source is empty or exceeds 100 KB" };
  let raw: unknown;
  try { raw = JSON.parse(bytes.toString("utf8")); }
  catch { return { error: "Design source is not valid JSON" }; }
  const parsed = parseDesignSpec(raw);
  if ("error" in parsed) return parsed;
  return {
    spec: parsed.spec,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    review: reviewDesign(parsed.spec),
  };
}
export async function getDesignApprovalState(input: {
  projectId: string; taskId: string; sourceFileId: string; bytes: Buffer;
}): Promise<{ status: DesignApprovalStatus; sha256: string; review: DesignReview;
  latest?: DesignApprovalRecord } | { error: string }> {
  const inspected = inspectDesignApproval(input.bytes);
  if ("error" in inspected) return inspected;
  const { sha256, review } = inspected;
  const latest = await (await collection()).find({
    projectId: input.projectId, taskId: input.taskId,
    sourceFileId: input.sourceFileId, sha256,
  }).sort({ decidedAt: -1, _id: -1 }).limit(1).next();
  const record = latest ? stripInternal(latest) : undefined;
  return { status: review.blockers > 0 ? "needs_changes" :
    record?.decision ?? "awaiting_approval", sha256, review, latest: record };
}
const stripInternal = ({ _id: _ignored, ...record }: Stored): DesignApprovalRecord => record;

/** Human decisions are append-only and bound to the immutable raw source digest. */
export async function decideDesignApproval(input: {
  projectId: string; taskId: string; sourceFileId: string;
  bytes: Buffer; reviewer: string; approve: boolean;
}): Promise<{ error: string } | DesignApprovalRecord> {
  const inspected = inspectDesignApproval(input.bytes);
  if ("error" in inspected) return inspected;
  if (input.approve && inspected.review.blockers)
    return { error: "Unresolved geometry conflicts; approval is blocked" };
  const decidedAt = new Date().toISOString();
  const record: Stored = {
    _id: randomUUID(), id: randomUUID(), projectId: input.projectId,
    taskId: input.taskId, sourceFileId: input.sourceFileId,
    sha256: inspected.sha256, reviewer: input.reviewer.trim().toLowerCase(),
    decision: input.approve ? "approved" : "rejected", decidedAt,
    blockers: inspected.review.blockers, warnings: inspected.review.warnings,
  };
  await (await collection()).insertOne(record);
  return stripInternal(record);
}
/** Final-save authorization must verify the current bytes, not a UI checkbox or stale SHA. */
export async function canReleaseDesign(input: {
  projectId: string; taskId: string; sourceFileId: string; bytes: Buffer;
}): Promise<boolean> {
  const state = await getDesignApprovalState(input);
  return !("error" in state) && state.status === "approved";
}
export const designFileFamily = (name: string) =>
  /^(design-[a-f0-9]{12})\.(design\.json|pdf|dxf|glb|preview\.png|web\.html|ifc)$/.exec(name);
