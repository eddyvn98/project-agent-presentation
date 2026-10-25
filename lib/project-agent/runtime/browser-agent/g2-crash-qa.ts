import { getMongoAiDb } from "@/services/mongodb/client";
import { PROJECT_AGENT_BOOT_ID } from "../../boot";
import { activeBrowserSession } from "./session";
import { browserLoopStatus } from "./loop-state";
import { runBrowserAction } from "./index";
import { quarantineExpiredBrowser, acknowledgeBrowserRecovery } from "./g2-lease-core.mjs";

const LEASE = "projectAgentBrowserOwnership";
const ACTIONS = "projectAgentG2CrashQaActions";
type Operation = "qa_g2_status" | "qa_g2_expire" | "qa_g2_quarantine" |
  "qa_g2_review" | "qa_g2_stale" | "qa_g2_cleanup";
const qaRun = () => process.env.G2_QA_RUN_ID ?? "";
/** No production, real task, unmarked QA task, or cross-project invocation. */
export function g2CrashQaAllowed(taskId: string, owner: string): boolean {
  return ["development", "test"].includes(process.env.NODE_ENV ?? "") &&
    process.env.G2_QA_CRASH_RECOVERY === "1" &&
    process.env.G2_ISOLATED_QA === "1" &&
    process.env.PROJECT_AGENT_G2_BROWSER_OWNERSHIP === "1" &&
    process.env.PROJECT_AGENT_P8_QA_SESSION === "1" &&
    process.env.PROJECT_AGENT_RUNTIME === "sandbox" &&
    /^pat_[a-f0-9]{12}$/.test(taskId) &&
    /^[a-z0-9._+-]+@project-agent\.test$/i.test(owner) &&
    /^[a-f0-9]{12}$/.test(qaRun());
}
async function collections() {
  const db = await getMongoAiDb();
  return { lease: db.collection(LEASE), actions: db.collection(ACTIONS) };
}
export async function g2QaClickReceipt(taskId: string, owner: string, count: number) {
  if (!g2CrashQaAllowed(taskId, owner)) return;
  const session = activeBrowserSession(taskId);
  if (!session?.g2RefEpoch || !Number.isSafeInteger(count) || count < 1 ||
      (browserLoopStatus(taskId)?.verified ?? 0) < 1)
    throw new Error("Synthetic G2 action receipt missing browser epoch");
  const { actions, lease } = await collections();
  const row = await lease.findOne({ _id: taskId,
    ownerEmail: owner, epoch: session.g2RefEpoch,
    state: "agent" });
  if (!row) throw new Error("G2 action lost ownership before QA receipt");
  await actions.insertOne({ _id: qaRun() + ":" + taskId + ":" +
    session.g2RefEpoch + ":" + count, runId: qaRun(), taskId, owner,
    epoch: session.g2RefEpoch, counter: count, kind: "verified_click" });
}
export async function g2CrashQaOperation(op: Operation, taskId: string,
  owner: string, raw: Record<string, unknown>) {
  if (!g2CrashQaAllowed(taskId, owner))
    throw new Error("Isolated G2 crash/recovery fixture disabled");
  const { lease, actions } = await collections();
  const filter = { _id: taskId, ownerEmail: owner };
  const row = await lease.findOne(filter);
  if (op === "qa_g2_status") {
    const receipts = await actions.find({ runId: qaRun(), taskId, owner })
      .project({ _id: 0, epoch: 1, counter: 1 }).sort({ epoch: 1 }).toArray();
    const session = activeBrowserSession(taskId);
    const ref = session?.page.isClosed() ? null : await session?.page
      .locator("#qa-count").getAttribute("data-agent-web-ref").catch(() => null);
    return { state: row?.state ?? null, epoch: row?.epoch ?? null,
      revision: row?.revision ?? null, actions: receipts, oldRef: ref ?? null,
      nodePid: process.pid, browserConnected: Boolean(session?.browser.isConnected()) };
  }
  if (!row || row.ownerEmail !== owner) throw new Error("G2 QA lease missing");
  if (op === "qa_g2_expire") {
    if (raw.confirmKilled !== true || row.state !== "agent" ||
        row.workerId === PROJECT_AGENT_BOOT_ID || !row.leaseToken)
      throw new Error("G2 expiry requires killed foreign worker proof from orchestrator");
    const changed = await lease.updateOne({ ...filter, epoch: row.epoch,
      workerId: row.workerId, leaseToken: row.leaseToken, state: "agent" },
      { $set: { leaseUntil: "2000-01-01T00:00:00.000Z" } });
    if (changed.modifiedCount !== 1) throw new Error("G2 expiry CAS lost");
    return { expired: true, epoch: row.epoch };
  }
  if (op === "qa_g2_quarantine") {
    if (!await quarantineExpiredBrowser(lease, taskId))
      throw new Error("G2 lease is not expired or already quarantined");
    return { quarantined: true };
  }
  if (op === "qa_g2_review") {
    const ticket = process.env.G2_QA_REVIEW_TICKET ?? "";
    if (raw.reviewed !== true || !/^[a-f0-9]{24}$/.test(ticket) ||
        raw.reviewTicket !== ticket || row.state !== "quarantined" ||
        !await acknowledgeBrowserRecovery(lease, taskId, owner, true))
      throw new Error("G2 reviewed recovery requires explicit operator ticket");
    return { reviewed: true, freshSessionRequired: true };
  }
  if (op === "qa_g2_stale") {
    const oldRef = raw.oldRef;
    if (typeof oldRef !== "string" || !/^e\d{1,15}$/.test(oldRef))
      throw new Error("Invalid old DOM ref");
    const session = activeBrowserSession(taskId);
    if (!session || session.page.isClosed() ||
        session.page.url() !== "about:blank" ||
        !await session.page.locator('[data-p7-synthetic="true"]').count())
      throw new Error("G2 stale-ref test requires synthetic Chromium");
    const before = await session.page.locator("#qa-output").textContent();
    if (session.refs.has(oldRef)) throw new Error("Old browser ref reused after recovery");
    const result = await runBrowserAction({
      chatId: taskId, taskId, user: owner, ownerEmail: owner,
      query: "G2 QA stale ref rejection only",
    }, { action: "browser", op: "click", ref: oldRef }, 29);
    const after = await session.page.locator("#qa-output").textContent();
    if (!result.failed || after !== before)
      throw new Error("Stale DOM ref executed or changed synthetic page");
    return { staleRejected: true, count: Number(after) };
  }
  if (op === "qa_g2_cleanup") {
    if (activeBrowserSession(taskId))
      throw new Error("Close synthetic Chromium before G2 ledger cleanup");
    const receiptCount = await actions.deleteMany({ runId: qaRun(), taskId, owner });
    const removed = await lease.deleteOne(filter);
    return { cleaned: true, receiptsDeleted: receiptCount.deletedCount,
      leaseDeleted: removed.deletedCount };
  }
  throw new Error("Unknown G2 QA operation");
}
