import assert from "node:assert/strict";
import { request } from "@playwright/test";
import { createInterface } from "node:readline/promises";
import { execFileSync } from "node:child_process";
import { startCrashHosts, killCrashHost, stopCrashHost } from "./g2-crash-hosts.mjs";
import { verifySyntheticNextAuthState } from "./p7-session-preflight.mjs";

const env = process.env;
const project = () => "/api/projects/" + encodeURIComponent(env.P7_PROJECT_ID);
const fixture = () => project() + "/agent/p7-qa";
const control = taskId => project() + "/agent/tasks/" + taskId + "/browser/control";
const post = (ctx, endpoint, origin, data) =>
  ctx.post(endpoint, { headers: { Origin: origin }, data, failOnStatusCode: false });
function assertChildProcessGroup(host, runtimePid) {
  assert.ok(Number.isSafeInteger(runtimePid) && runtimePid > 1);
  const actual = Number(execFileSync("ps", ["-o", "pgid=", "-p", String(runtimePid)],
    { encoding: "utf8" }).trim());
  assert.equal(actual, host.child.pid,
    "Next route runtime PID must belong to the harness-owned process group");
}
async function requirePostCrashReview(taskId, epoch, receipts) {
  assert.equal(process.stdin.isTTY, true,
    "Operator must use an interactive TTY to review quarantine proof AFTER the crash");
  const expected = `REVIEW ${taskId} ${epoch} ${receipts}`;
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const typed = await terminal.question(
      `G2 quarantined; verified ${receipts} pre-crash receipt(s). Type exactly "${expected}" to approve fresh synthetic browser: `);
    assert.equal(typed.trim(), expected, "Operator did not approve reviewed recovery");
  } finally { terminal.close(); }
}
async function expectReply(response, status) {
  const text = await response.text();
  assert.equal(response.status(), status, text.slice(0, 250));
  return JSON.parse(text);
}
async function healthy(origin, host) {
  const started = Date.now();
  while (Date.now() - started < 150_000) {
    if (host.child.exitCode !== null || host.child.signalCode !== null)
      throw new Error("Next worker exited before ready: " + host.getLog().slice(-1200));
    try {
      const ctx = await request.newContext({ baseURL: origin });
      const response = await ctx.get("/api/auth/session", { timeout: 1800,
        failOnStatusCode: false });
      await ctx.dispose();
      if (response.status() === 200) return;
    } catch { /* Next dev compile is not ready */ }
    await new Promise(resolve => setTimeout(resolve, 900));
  }
  throw new Error("Next server readiness timeout: " + host.getLog().slice(-1200));
}
async function verifySessions(a, b) {
  const users = [[env.P7_OWNER_STORAGE_STATE, env.P7_OWNER_EMAIL],
    [env.P7_NONMEMBER_STORAGE_STATE, env.P7_OTHER_EMAIL]];
  for (const origin of [a, b]) {
    for (const [state, email] of users)
      assert.equal(await verifySyntheticNextAuthState(origin, state, email, request),
        email.toLowerCase());
  }
}
async function run() {
  let hosts = [], ownerA, ownerB, outsider, taskId, bOrigin;
  let succeeded = false, cleanupError;
  try {
    hosts = await startCrashHosts(env);
    assert.notEqual(hosts[0].child.pid, hosts[1].child.pid);
    const [a, b] = hosts.map(host => host.origin);
    bOrigin = b;
    console.log("G2 QA spawned Next launch PIDs", hosts.map(h => h.child.pid));
    await Promise.all(hosts.map(h => healthy(h.origin, h)));
    await verifySessions(a, b);
    ownerA = await request.newContext({ baseURL: a,
      storageState: env.P7_OWNER_STORAGE_STATE });
    ownerB = await request.newContext({ baseURL: b,
      storageState: env.P7_OWNER_STORAGE_STATE });
    outsider = await request.newContext({ baseURL: b,
      storageState: env.P7_NONMEMBER_STORAGE_STATE });
    const created = await expectReply(await post(ownerA, fixture(), a,
      { kind: "p8_browser" }), 201);
    taskId = created.taskId;
    assert.match(taskId, /^pat_[a-f0-9]{12}$/);
    const sendA = data => post(ownerA, control(taskId), a, data);
    const sendB = data => post(ownerB, control(taskId), b, data);
    await expectReply(await sendA({ op: "qa_probe" }), 200);
    await expectReply(await sendB({ op: "qa_probe" }), 200);
    const preparedA = await expectReply(await sendA({ op: "qa_prepare" }), 200);
    assert.equal(preparedA.connected, true);
    assert.equal(preparedA.networkAttempts, 0);
    const first = await expectReply(await sendA({ op: "qa_step",
      kind: "click" }), 200);
    assert.equal(first.count, 1);
    assert.ok(first.loop?.verified >= 1, "P8 checker must independently verify the first click");
    const proofA = await expectReply(await sendA({ op: "qa_g2_status" }), 200);
    assert.equal(proofA.state, "agent");
    assert.equal(proofA.epoch, 1);
    assert.equal(proofA.actions.length, 1);
    assert.equal(proofA.actions[0].counter, 1);
    assert.match(proofA.oldRef, /^e\d+$/);
    assert.equal(proofA.nodePid, preparedA.pid);
    assertChildProcessGroup(hosts[0], proofA.nodePid);
    await expectReply(await sendB({ op: "qa_prepare" }), 409);
    const denied = await post(outsider, control(taskId), b,
      { op: "qa_g2_review", reviewed: true });
    assert.ok([401, 403, 404].includes(denied.status()),
      "Synthetic nonmember must be denied recovery");
    // Kill ONLY the OS process group started by this harness.
    await killCrashHost(hosts[0]);
    assert.ok(hosts[0].child.exitCode !== null ||
      hosts[0].child.signalCode !== null, "A must be confirmed dead");
    console.log("G2 QA worker A killed after verified Chromium click", {
      launcherPid: hosts[0].child.pid, runtimePid: proofA.nodePid,
      epoch: proofA.epoch, receipts: proofA.actions.length,
    });
    const stillRunning = await expectReply(await sendB({ op: "qa_g2_status" }), 200);
    assert.equal(stillRunning.state, "agent");
    assert.equal(stillRunning.browserConnected, false);
    assert.equal(stillRunning.actions.length, 1);
    await expectReply(await sendB({ op: "qa_prepare" }), 409);
    await expectReply(await sendB({ op: "qa_g2_expire",
      confirmKilled: true }), 200);
    await expectReply(await sendB({ op: "qa_g2_quarantine" }), 200);
    const quarantined = await expectReply(await sendB({ op: "qa_g2_status" }), 200);
    assert.equal(quarantined.state, "quarantined");
    assert.equal(quarantined.actions.length, 1);
    await expectReply(await sendB({ op: "qa_prepare" }), 409);
    await requirePostCrashReview(taskId, quarantined.epoch, quarantined.actions.length);
    await expectReply(await sendB({ op: "qa_g2_review", reviewed: true }), 409);
    await expectReply(await sendB({ op: "qa_g2_review", reviewed: true,
      reviewTicket: env.G2_QA_REVIEW_TICKET }), 200);
    const reviewed = await expectReply(await sendB({ op: "qa_g2_status" }), 200);
    assert.equal(reviewed.state, "vacant");
    assert.equal(reviewed.epoch, proofA.epoch);
    assert.equal(reviewed.actions.length, 1);
    const preparedB = await expectReply(await sendB({ op: "qa_prepare" }), 200);
    assert.equal(preparedB.connected, true);
    assert.equal(preparedB.networkAttempts, 0);
    const proofB = await expectReply(await sendB({ op: "qa_g2_status" }), 200);
    assert.equal(proofB.state, "agent");
    assert.equal(proofB.epoch, proofA.epoch + 1);
    assert.notEqual(proofB.nodePid, proofA.nodePid);
    assertChildProcessGroup(hosts[1], proofB.nodePid);
    assert.notEqual(proofB.oldRef, proofA.oldRef);
    assert.equal(proofB.actions.length, 1, "Old action must not replay");
    const stale = await expectReply(await sendB({
      op: "qa_g2_stale", oldRef: proofA.oldRef }), 200);
    assert.deepEqual(stale, { staleRejected: true, count: 0 });
    const afterStale = await expectReply(await sendB({ op: "qa_g2_status" }), 200);
    assert.equal(afterStale.actions.length, 1);
    const deliberate = await expectReply(await sendB({ op: "qa_step",
      kind: "click" }), 200);
    assert.equal(deliberate.count, 1);
    const final = await expectReply(await sendB({ op: "qa_g2_status" }), 200);
    assert.equal(final.actions.length, 2);
    assert.deepEqual(final.actions.map(x => x.epoch), [proofA.epoch, proofB.epoch]);
    assert.deepEqual(final.actions.map(x => x.counter), [1, 1]);
    succeeded = true;
    console.log(JSON.stringify({ g2CrashE2E: "PASS", actualNextProcessCount: 2,
      aRuntimePid: proofA.nodePid, bRuntimePid: proofB.nodePid,
      oldEpoch: proofA.epoch, newEpoch: proofB.epoch,
      oldActionCountBeforeBClick: 1, finalExplicitActions: 2,
      staleRefRejected: true, externalActions: false }, null, 2));
  } finally {
    // The QA child group is owned by this harness; never delete a live lease.
    if (hosts[0]) await killCrashHost(hosts[0]).catch(() => {});
    if (ownerB && taskId && bOrigin) {
      const failures = [], endpoint = control(taskId);
      for (const [label, action] of [
        ["browser", () => post(ownerB, endpoint, bOrigin, { op: "qa_cleanup" })],
        ["lease-ledger", () => post(ownerB, endpoint, bOrigin,
          { op: "qa_g2_cleanup", confirmKilled: true })],
        ["synthetic-task", () => ownerB.delete(fixture(), {
          headers: { Origin: bOrigin }, data: { taskId },
          failOnStatusCode: false })],
      ]) {
        try { await expectReply(await action(), 200); }
        catch (error) { failures.push(label + ": " + error.message); }
      }
      if (failures.length) cleanupError = new Error(
        "Synthetic cleanup incomplete: " + failures.join("; "));
    }
    for (const ctx of [outsider, ownerA, ownerB]) await ctx?.dispose().catch(() => {});
    for (const host of hosts.reverse()) {
      await stopCrashHost(host).catch(async () => {
        await killCrashHost(host).catch(() => {});
      });
    }
    if (cleanupError) throw cleanupError;
  }
  assert.equal(succeeded, true);
}
run().catch(error => {
  console.error("G2 crash/Next host acceptance FAIL:", error.message);
  process.exitCode = 1;
});
