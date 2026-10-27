import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { withQaDb, newQaId } from "./p1-qa-mongo.mjs";
import { claimBrowserLease, assertBrowserLease, changeBrowserControl,
  quarantineExpiredBrowser, acknowledgeBrowserRecovery, stopBrowserLease } from
  "../lib/project-agent/runtime/browser-agent/g2-lease-core.mjs";

const workerFile = resolve(dirname(fileURLToPath(import.meta.url)), "p1-chaos-worker.mjs");
const owner = index => "p1-owner-" + index % 4 + "@project-agent.test";
const id = () => "pat_" + newQaId();

function receive(child, wanted, timeoutMs = 12_000) {
  return new Promise((resolveReceive, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(Error("IPC timeout " + wanted)); }, timeoutMs);
    const onMessage = msg => {
      if (msg.event === wanted || msg.event === "error") {
        cleanup(); if (msg.event === "error") reject(Error(msg.message));
        else resolveReceive(msg);
      }
    };
    const onExit = code => { cleanup(); reject(Error("Worker died unexpectedly: " + code)); };
    function cleanup() {
      clearTimeout(timer); child.off("message", onMessage); child.off("exit", onExit);
    }
    child.on("message", onMessage); child.once("exit", onExit);
  });
}
async function kill(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const died = new Promise(resolveDied => child.once("exit", resolveDied));
  child.kill("SIGKILL"); await died;
}
async function actualCrash(runId, dbName, taskId, email, mode) {
  const child = fork(workerFile, [], {
    env: { ...process.env, P1_RUN_ID: runId, P1_DATABASE: dbName },
    stdio: ["ignore", "ignore", "pipe", "ipc"], execArgv: [],
  });
  try {
    await receive(child, "ready");
    const result = receive(child, "effect_boundary");
    child.send({ id: taskId, owner: email, mode });
    const boundary = await result;
    await kill(child);
    assert.ok(child.exitCode !== null || child.signalCode !== null);
    return boundary.epoch;
  } finally { await kill(child); }
}
async function crashCases({ db, runId, name }) {
  const leases = db.collection("projectAgentBrowserOwnership");
  const actions = db.collection("p1_test_actions");
  const outcomes = [];
  for (let index = 0; index < 12; index++) {
    const task = id(), email = owner(index), mode = index % 2 ? "before" : "after";
    const firstEpoch = await actualCrash(runId, name, task, email, mode);
    const before = await actions.countDocuments({ taskId: task });
    assert.equal(before, mode === "after" ? 1 : 0);
    assert.equal(await claimBrowserLease(leases, task, email, "replacement"), null);
    // The worker is verified dead; only the marked QA database's lease is expired.
    await leases.updateOne({ _id: task, ownerEmail: email, state: "agent" },
      { $set: { leaseUntil: "2000-01-01T00:00:00.000Z" } });
    assert.equal(await quarantineExpiredBrowser(leases, task), true);
    assert.equal(await claimBrowserLease(leases, task, email, "replacement"), null);
    await assert.rejects(acknowledgeBrowserRecovery(leases, task, email, false), /review/);
    assert.equal(await acknowledgeBrowserRecovery(leases, task,
      "outsider@project-agent.test", true), false);
    assert.equal(await actions.countDocuments({ taskId: task }), before);
    assert.equal(await acknowledgeBrowserRecovery(leases, task, email, true), true);
    const resumed = await claimBrowserLease(leases, task, email, "reviewed-worker");
    assert.ok(resumed && resumed.epoch > firstEpoch);
    assert.equal(await actions.countDocuments({ taskId: task }), before,
      "Review must not automatically replay effects");
    assert.ok(await assertBrowserLease(leases, resumed));
    outcomes.push({ case: mode, replayed: 0 });
  }
  return outcomes;
}
async function outages({ db, url }) {
  const leases = db.collection("projectAgentBrowserOwnership");
  const actions = db.collection("p1_test_actions");
  for (let index = 0; index < 6; index++) {
    const task = id(), email = owner(index);
    const disconnected = new MongoClient(url, { directConnection: true,
      serverSelectionTimeoutMS: 500 });
    await disconnected.connect();
    const staleCollection = disconnected.db(db.databaseName)
      .collection("projectAgentBrowserOwnership");
    const claim = await claimBrowserLease(staleCollection, task, email, "disconnected-worker");
    assert.ok(claim);
    await disconnected.close();
    await assert.rejects(assertBrowserLease(staleCollection, claim),
      /closed|topology|client|connection|inactive/i);
    assert.equal(await actions.countDocuments({ taskId: task }), 0);
    await leases.updateOne({ _id: task, state: "agent" },
      { $set: { leaseUntil: "2000-01-01T00:00:00.000Z" } });
    assert.equal(await quarantineExpiredBrowser(leases, task), true);
    assert.equal(await claimBrowserLease(leases, task, email, "other-worker"), null);
  }
  return 6;
}
async function stopDuringTakeover({ db }) {
  const leases = db.collection("projectAgentBrowserOwnership");
  for (let index = 0; index < 20; index++) {
    const task = id(), email = owner(index);
    const lease = await claimBrowserLease(leases, task, email, "takeover-worker");
    assert.ok(lease);
    const stale = { ...lease };
    await changeBrowserControl(leases, lease, "agent", "human");
    await assert.rejects(assertBrowserLease(leases, stale, "agent"), /lost/);
    assert.equal(await stopBrowserLease(leases, task, email), true);
    await assert.rejects(assertBrowserLease(leases, lease, "human"), /lost/);
    assert.equal(await claimBrowserLease(leases, task, email, "late-worker"), null);
    assert.equal(await stopBrowserLease(leases, task, "other@project-agent.test"), false);
    assert.equal(await stopBrowserLease(leases, task, email), false);
  }
  return 20;
}
const started = Date.now();
const report = await withQaDb("chaos", async context => {
  await context.db.collection("p1_test_actions").createIndex({ taskId: 1 }, { unique: true });
  const crash = await crashCases(context);
  const outageCases = await outages(context);
  const takeoverStops = await stopDuringTakeover(context);
  return { osWorkerSigkills: crash.length, crashBeforeEffect: crash.filter(c => c.case === "before").length,
    crashAfterEffect: crash.filter(c => c.case === "after").length,
    simulatedClientDisconnects: outageCases, stopDuringTakeover: takeoverStops,
    forbiddenOwnerRecovery: 0, automaticReplays: 0,
    elapsedMs: Date.now() - started, externalCalls: false, hostNext: false };
});
console.log(JSON.stringify({ p1Chaos: "PASS", ...report }, null, 2));
