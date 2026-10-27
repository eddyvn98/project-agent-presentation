import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withQaDb, newQaId } from "./p1-qa-mongo.mjs";
import { assertBrowserLease, claimBrowserLease, stopBrowserLease, renewBrowserLease } from
  "../lib/project-agent/runtime/browser-agent/g2-lease-core.mjs";

const COUNT = 120, WORKERS = 12;
const owners = Array.from({ length: 4 }, (_, i) => "p1-owner-" + i + "@project-agent.test");
const childPath = resolve(dirname(fileURLToPath(import.meta.url)), "p1-stress-worker.mjs");
const wait = (child, expected, timeoutMs = 45_000) => new Promise((resolveWait, reject) => {
  const timer = setTimeout(() => {
    cleanup(); reject(Error("Stress worker timed out: " + expected));
  }, timeoutMs);
  const message = msg => {
    if (msg.event === "error" || msg.event === expected) {
      cleanup();
      if (msg.event === "error") reject(Error(msg.message));
      else resolveWait(msg);
    }
  };
  const exit = code => { cleanup(); reject(Error("Worker exited: " + code)); };
  function cleanup() {
    clearTimeout(timer); child.off("message", message); child.off("exit", exit);
  }
  child.on("message", message); child.once("exit", exit);
});

const report = await withQaDb("stress", async ({ db, name, runId }) => {
  const coll = db.collection("projectAgentBrowserOwnership");
  const actions = db.collection("p1_test_actions");
  await actions.createIndex({ taskId: 1 }, { unique: true });
  const ids = Array.from({ length: COUNT }, () => "pat_" + newQaId());
  const children = [];
  const start = Date.now();
  try {
    for (let i = 0; i < WORKERS; i++) {
      const child = fork(childPath, [], {
        env: { ...process.env, P1_DATABASE: name, P1_RUN_ID: runId, P1_WORKER: "stress-" + i },
        stdio: ["ignore", "ignore", "pipe", "ipc"], execArgv: [],
      });
      children.push(child);
      // Attach before next event loop turn so no ready message is lost.
      const ready = wait(child, "ready", 15_000);
      assert.equal((await ready).event, "ready");
    }
    assert.equal(new Set(children.map(c => c.pid)).size, WORKERS);
    const replies = children.map(child => wait(child, "done"));
    for (const child of children) child.send({ op: "start", ids });
    const summaries = await Promise.all(replies);
    assert.equal(summaries.reduce((s, x) => s + x.claimed, 0), COUNT);
    assert.equal(summaries.reduce((s, x) => s + x.authorized, 0), COUNT);
    assert.equal(summaries.reduce((s, x) => s + x.lost, 0), COUNT * (WORKERS - 1));
    const all = await actions.find({}).toArray();
    assert.equal(all.length, COUNT);
    assert.equal(new Set(all.map(x => x.taskId)).size, COUNT);
    const leases = await coll.find({}).toArray();
    assert.equal(leases.length, COUNT);
    for (const [index, id] of ids.entries()) {
      const action = all.find(x => x.taskId === id);
      const lease = leases.find(x => x._id === id);
      assert.equal(action.owner, owners[index % 4]);
      assert.equal(lease.ownerEmail, action.owner);
      assert.equal(lease.state, "agent");
      assert.equal(action.authorizedEpoch, lease.epoch);
    }
    const stopped = ids.slice(0, 40);
    const stoppedClaims = stopped.map(id => {
      const doc = leases.find(row => row._id === id);
      return { id, ownerEmail: doc.ownerEmail, workerId: doc.workerId,
        token: doc.leaseToken, epoch: doc.epoch, revision: doc.revision };
    });
    const stop = await Promise.all(stoppedClaims.map(c =>
      stopBrowserLease(coll, c.id, c.ownerEmail)));
    assert.ok(stop.every(Boolean));
    await Promise.all(stoppedClaims.map(async c => {
      await assert.rejects(assertBrowserLease(coll, c), /lost|changed/);
      assert.equal(await renewBrowserLease(coll, c), false);
      assert.equal(await claimBrowserLease(coll, c.id, c.ownerEmail, "late-worker"), null);
      assert.equal(await stopBrowserLease(coll, c.id, "outsider@project-agent.test"), false);
    }));
    assert.equal(await actions.countDocuments({}), COUNT, "Stop must not replay actions");
    return { tasks: COUNT, osWorkerProcesses: WORKERS,
      leaseClaimAttempts: COUNT * WORKERS, claimed: COUNT, competingClaimsRejected: COUNT * (WORKERS - 1),
      duplicateActions: 0, stopFenced: stopped.length, crossTenantStopsAccepted: 0,
      elapsedMs: Date.now() - start, maxWorkerElapsedMs: Math.max(...summaries.map(s => s.elapsedMs)),
      externalCalls: false, browser: false };
  } finally {
    await Promise.all(children.map(child => new Promise(done => {
      if (child.exitCode !== null || child.signalCode !== null) return done();
      child.once("exit", done); child.disconnect();
      setTimeout(() => { if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL"); }, 3000).unref();
    })));
  }
});
console.log(JSON.stringify({ p1Stress: "PASS", ...report }, null, 2));
