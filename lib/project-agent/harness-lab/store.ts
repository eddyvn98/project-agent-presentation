import { randomUUID } from "node:crypto";
import { getMongoAiDb } from "@/services/mongodb/client";
import { validateHarnessGuidance, parseHarnessDimension, parseHarnessDomain } from "./guard";
import type { HarnessVariant, HarnessEvidence, HarnessDimension, HarnessStatus } from "./types";

interface Stored extends HarnessVariant {
  _id: string; leaseToken?: string; leaseUntil?: string; attempts: number;
}
const validId = (id: string) => /^hl_[0-9a-f-]{36}$/.test(id);
const account = (owner: string) => {
  const value = owner.trim().toLowerCase();
  if (!value.includes("@")) throw new Error("Account login is required");
  return value;
};
const now = () => new Date().toISOString();
let setup: Promise<unknown> | null = null;
async function coll() {
  const db = await getMongoAiDb();
  const collection = db.collection<Stored>("projectAgentHarnessVariants");
  if (!setup) setup = Promise.all([
    collection.createIndex({ ownerEmail: 1, updatedAt: -1 }),
    collection.createIndex({ status: 1, leaseUntil: 1 }),
  ]).catch(error => { setup = null; throw error; });
  await setup;
  return collection;
}
const visible = (row: Stored): HarnessVariant => {
  const { _id: _id, leaseToken: _token, leaseUntil: _lease, attempts: _attempts, ...value } = row;
  return value;
};
export async function listHarnessVariants(owner: string) {
  const rows = await (await coll()).find({ ownerEmail: account(owner) })
    .sort({ createdAt: -1 }).limit(80).toArray();
  return rows.map(visible);
}
export async function getHarnessVariant(owner: string, id: string) {
  if (!validId(id)) throw new Error("Invalid harness revision");
  const result = await (await coll()).findOne({ _id: id, ownerEmail: account(owner) });
  return result ? visible(result) : null;
}
export async function createHarnessVariant(owner: string, input: {
  title: string; domain: string; dimension: HarnessDimension; guidance: string;
  rationale?: string; baselineId?: string;
}): Promise<HarnessVariant> {
  const email = account(owner), domain = parseHarnessDomain(input.domain);
  const dimension = parseHarnessDimension(input.dimension);
  const guidance = validateHarnessGuidance(input.guidance);
  const title = input.title?.trim();
  if (!title || title.length > 100) throw new Error("Harness title is required (max 100)");
  const collection = await coll();
  if (await collection.countDocuments({ ownerEmail: email }, { limit: 81 }) >= 80)
    throw new Error("At most 80 harness revisions per account");
  let parentVersion = 0;
  if (input.baselineId) {
    const parent = await getHarnessVariant(email, input.baselineId);
    if (!parent || parent.domain !== domain || parent.dimension !== dimension)
      throw new Error("Parent harness does not exist in this account and domain");
    parentVersion = parent.version;
  }
  const timestamp = now();
  const record: Stored = {
    _id: "hl_" + randomUUID(), id: "", ownerEmail: email, domain, dimension,
    title, guidance, status: "draft", version: parentVersion + 1, rolloutPercent: 0,
    rationale: input.rationale?.slice(0, 400), baselineId: input.baselineId,
    createdAt: timestamp, updatedAt: timestamp, attempts: 0,
  };
  record.id = record._id;
  await collection.insertOne(record);
  return visible(record);
}
export async function queueHarnessEvaluation(owner: string, id: string) {
  const res = await (await coll()).findOneAndUpdate({
    _id: id, ownerEmail: account(owner), status: { $in: ["draft","rejected","evaluated"] },
  }, { $set: { status: "queued", updatedAt: now(), rolloutPercent: 0 },
    $unset: { evidence: "", failure: "", leaseUntil: "", leaseToken: "" } },
  { returnDocument: "after" });
  if (!res) throw new Error("Only a draft or an inactive evaluated variant may be reevaluated");
  return visible(res);
}
export async function claimHarnessEvaluation() {
  const token = randomUUID(), until = new Date(Date.now() + 12 * 60_000).toISOString();
  const row = await (await coll()).findOneAndUpdate({
    $or: [{ status: "queued" },
      { status: "evaluating", leaseUntil: { $lt: now() }, attempts: { $lt: 2 } }],
  }, { $set: { status: "evaluating", leaseToken: token, leaseUntil: until, updatedAt: now() },
    $inc: { attempts: 1 } },
  { sort: { createdAt: 1 }, returnDocument: "after" });
  return row ? { variant: visible(row), token } : null;
}
export async function completeHarnessEvaluation(id: string, token: string, evidence: HarnessEvidence) {
  await (await coll()).updateOne({ _id: id, leaseToken: token, status: "evaluating" },
    { $set: { evidence, status: evidence.improved ? "evaluated" : "rejected", updatedAt: now() },
      $unset: { leaseToken: "", leaseUntil: "", failure: "" } });
}
export async function failHarnessEvaluation(id: string, token: string, reason: string) {
  await (await coll()).updateOne({ _id: id, leaseToken: token, status: "evaluating" },
    { $set: { status: "rejected", failure: reason.slice(0, 240), updatedAt: now() },
      $unset: { leaseToken: "", leaseUntil: "" } });
}
export async function changeHarnessRollout(owner: string, id: string,
  action: "canary" | "promote" | "rollback") {
  const email = account(owner), collection = await coll();
  const variant = await getHarnessVariant(email, id);
  if (!variant) throw new Error("Harness not found");
  if (action === "rollback") {
    if (!["canary","active"].includes(variant.status)) throw new Error("Only deployed harnesses can roll back");
    await collection.updateOne({ _id: id, ownerEmail: email, status: variant.status },
      { $set: { status: "retired" as HarnessStatus, rolloutPercent: 0, updatedAt: now() } });
    return getHarnessVariant(email, id);
  }
  if (!variant.evidence?.improved) throw new Error("Harness has not passed offline comparison");
  const allowed = action === "canary" ? ["evaluated"] : ["canary"];
  if (!allowed.includes(variant.status)) throw new Error("This transition is not allowed");
  const competing = await collection.countDocuments({
    ownerEmail: email, domain: variant.domain, dimension: variant.dimension,
    status: { $in: ["canary","active"] }, _id: { $ne: id },
  }, { limit: 1 });
  if (competing) throw new Error("Roll back the other deployed variant in this domain/dimension first");
  if (action === "promote") {
    const { trial, control } = await harnessOutcomeTotals(email, id);
    if (trial.count < 15 || control.count < 15 ||
      trial.failed / trial.count > control.failed / control.count + 0.05)
      throw new Error("Canary needs 15 trial and 15 control runs without failure regression");
  }
  const status: HarnessStatus = action === "canary" ? "canary" : "active";
  const saved = await collection.findOneAndUpdate({
    _id: id, ownerEmail: email, status: variant.status,
  }, { $set: { status, rolloutPercent: action === "canary" ? 20 : 100, updatedAt: now() } },
  { returnDocument: "after" });
  if (!saved) throw new Error("Concurrent change; reload the harness");
  return visible(saved);
}
export async function harnessOutcomeTotals(owner: string, id: string) {
  const db = await getMongoAiDb();
  const rows = await db.collection<{ variantId: string; ownerEmail: string; group: string; outcome: string }>(
    "projectAgentHarnessOutcomes").find({ variantId: id, ownerEmail: account(owner) }).limit(2000).toArray();
  const summarize = (group: string) => ({
    count: rows.filter(r => r.group === group).length,
    failed: rows.filter(r => r.group === group && r.outcome === "failed").length,
  });
  return { trial: summarize("trial"), control: summarize("control") };
}

/** Compose only previously evaluated, same-domain evidence-backed candidates. */
export async function composeHarnessVariants(owner: string, leftId: string, rightId: string) {
  if (leftId === rightId) throw new Error("Select two different candidates");
  const [left, right] = await Promise.all([
    getHarnessVariant(owner,leftId), getHarnessVariant(owner,rightId),
  ]);
  if (!left || !right || left.domain !== right.domain ||
    !left.evidence?.improved || !right.evidence?.improved)
    throw new Error("Both components need favorable evidence from the same domain");
  if (left.dimension !== right.dimension)
    throw new Error("Compose within one component; cross-component combinations require independent evaluation");
  const guidance = validateHarnessGuidance(
    [left.guidance,right.guidance].join("\n\n").slice(0,1800));
  return createHarnessVariant(owner,{
    title: ("Composition: "+left.title+" + "+right.title).slice(0,100),
    domain: left.domain, dimension: left.dimension,
    guidance, baselineId: left.id,
    rationale: "Composition of two evidence-supported revisions: "+left.id+", "+right.id,
  });
}
