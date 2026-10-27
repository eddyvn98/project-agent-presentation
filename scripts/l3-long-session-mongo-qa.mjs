import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { fork } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { quarantineExpiredBrowser, acknowledgeBrowserRecovery,
  claimBrowserLease, stopBrowserLease } from
  "../lib/project-agent/runtime/browser-agent/g2-lease-core.mjs";
const url = new URL(process.env.L3_MONGO_URI ?? "");
assert.equal(process.env.L3_ISOLATED_QA, "1", "Explicit L3 QA opt-in required");
assert.ok(url.protocol === "mongodb:" && url.hostname === "127.0.0.1" &&
  url.port === "27019" && ["", "/"].includes(url.pathname) &&
  !url.username && !url.password && !url.search && !url.hash,
  "L3 refuses all endpoints except bare 127.0.0.1:27019");
const runId = randomBytes(6).toString("hex");
const name = "l3_long_session_qa_" + runId;
const taskId = "pat_" + randomBytes(6).toString("hex");
const owner = "l3-owner@project-agent.test";
const file = resolve(dirname(fileURLToPath(import.meta.url)), "l3-long-session-worker.mjs");
const client = new MongoClient(url.toString(), { directConnection: true, serverSelectionTimeoutMS: 5000 });
const children = new Set();
let db, created = false;
const start = Date.now();
function spawn(worker) {
  const child = fork(file, [], {
    env: { ...process.env, L3_DB_NAME: name, L3_RUN_ID: runId, L3_TASK_ID: taskId },
    stdio: ["ignore", "ignore", "pipe", "ipc"], execArgv: [],
  });
  let stderr = "";
  child.stderr.on("data", data => { stderr += String(data).slice(0, 2000); });
  children.add(child);
  child.once("exit", () => children.delete(child));
  const buffered = [], pending = [];
  child.on("message", msg => { if (pending.length) pending.shift()(msg); else buffered.push(msg); });
  return { child, send(op, extra = {}) { child.send({ op, worker, ...extra }); },
    async next() {
      const msg = buffered.shift() ?? await new Promise((done, reject) => {
        const callback = value => { clearTimeout(timer); done(value); };
        const timer = setTimeout(() => {
          const at = pending.indexOf(callback);
          if (at >= 0) pending.splice(at, 1);
          reject(Error("L3 IPC timeout for " + worker + ": " + stderr));
        }, 15000);
        pending.push(callback);
      });
      assert.notEqual(msg.event, "error", msg.detail ?? stderr);
      return msg;
    },
  };
}
async function kill(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(done => child.once("exit", done));
  child.kill("SIGKILL");
  await exited;
}
async function seed() {
  const rows = [], base = Date.UTC(2026, 9, 27);
  for (let i = 1; i <= 1000; i++) {
    const createdAt = new Date(base + i * 60000).toISOString();
    const decision = i === 50 ? "RED" : i === 995 ? "BLUE" : null;
    const compact = [250, 500, 750, 980].indexOf(i) + 1;
    const entryId = "pat_" + i.toString(16).padStart(12, "0");
    rows.push({ _id: entryId, id: entryId, projectId: "l3_project",
      ownerEmail: owner, conversationId: "l3_chat", status: "done", createdAt,
      userPrompt: decision ? "Change design to " + decision : "Synthetic turn " + i,
      resultText: decision ? "Approved design = " + decision : "Synthetic result " + i,
      ...(compact ? { difyConversationId: "dify-segment-" + compact } : {}) });
  }
  for (let i = 0; i < 180; i++) rows.push({
    _id: "pat_" + (2000 + i).toString(16).padStart(12, "0"),
    projectId: "l3_project", ownerEmail: owner, conversationId: "foreign-chat",
    status: "done", createdAt: new Date(base + i * 5 * 60000 + 30000).toISOString(),
    resultText: "Unrelated Project chat",
  });
  rows.push({ _id: "pat_ffffffffffff", projectId: "other-project", ownerEmail: owner,
    conversationId: "l3_chat", status: "done", createdAt: new Date(base + 1001 * 60000).toISOString(),
    resultText: "Private other Project" });
  rows.push({ _id: "pat_eeeeeeeeeeee", projectId: "l3_project",
    ownerEmail: "other-owner@project-agent.test", conversationId: "l3_chat",
    status: "done", createdAt: new Date(base + 1002 * 60000).toISOString(),
    resultText: "Private other owner" });
  await db.collection("project_agent_tasks").insertMany(rows);
  await db.collection("project_agent_tasks").createIndex({
    projectId: 1, ownerEmail: 1, conversationId: 1, createdAt: -1,
  });
}
const cases = [];
try {
  await client.connect();
  db = client.db(name);
  assert.equal((await db.listCollections().toArray()).length, 0, "Refusing existing QA DB");
  await db.collection("l3_test_run").insertOne({
    _id: "marker", runId, purpose: "isolated_long_session_l3",
  });
  created = true;
  await seed();
  await db.collection("l3_effects").createIndex({ taskId: 1, key: 1 }, { unique: true });

  const a = spawn("l3-a");
  assert.equal((await a.next()).event, "ready");
  a.send("claim"); assert.equal((await a.next()).event, "claimed");
  a.send("effect");
  assert.equal((await a.next()).inserted, 1);
  await kill(a.child);
  cases.push("SIGKILL after committed effect");

  const b = spawn("l3-b");
  assert.equal((await b.next()).event, "ready");
  b.send("recover");
  const recovered = await b.next();
  assert.equal(recovered.event, "recovery");
  assert.equal(recovered.turns, 1000);
  assert.equal(recovered.recent, 8);
  assert.equal(recovered.correction, "Approved design = BLUE");
  assert.equal(recovered.modelId, "dify-segment-4");
  assert.equal(recovered.blocked, true);
  assert.equal(recovered.effects, 1);
  cases.push("long chat and latest compacted Dify id survive process crash");

  const leases = db.collection("projectAgentBrowserOwnership");
  const old = await leases.findOne({ _id: taskId });
  assert.equal(old?.epoch, 1);
  await leases.updateOne({ _id: taskId, state: "agent" },
    { $set: { leaseUntil: "2000-01-01T00:00:00.000Z" } });
  assert.equal(await quarantineExpiredBrowser(leases, taskId), true);
  assert.equal(await acknowledgeBrowserRecovery(leases, taskId, "foreign@example.test", true), false);
  await assert.rejects(acknowledgeBrowserRecovery(leases, taskId, owner, false), /review/);
  assert.equal(await claimBrowserLease(leases, taskId, owner, "unreviewed"), null);
  assert.equal(await acknowledgeBrowserRecovery(leases, taskId, owner, true), true);
  b.send("claim");
  const resumed = await b.next();
  assert.equal(resumed.event, "claimed");
  assert.ok(resumed.epoch > old.epoch);
  b.send("continue");
  const continued = await b.next();
  assert.equal(continued.replayed, 0);
  assert.equal(continued.newActions, 1);
  assert.equal(continued.effects, 2);
  b.send("close"); assert.equal((await b.next()).event, "closed");
  cases.push("quarantine + explicit review, fenced handoff, no effect replay");

  b.send("disconnect");
  assert.equal((await b.next()).rejected, true);
  await kill(b.child);
  const c = spawn("l3-c");
  assert.equal((await c.next()).event, "ready");
  c.send("inspect");
  const restored = await c.next();
  assert.equal(restored.turns, 1000);
  assert.equal(restored.correction, "Approved design = BLUE");
  assert.equal(restored.effects, 2);
  cases.push("disconnection + new OS process persists history and action ledger");

  const stopped = "pat_" + randomBytes(6).toString("hex");
  assert.ok(await claimBrowserLease(leases, stopped, owner, "stop-test"));
  assert.equal(await stopBrowserLease(leases, stopped, owner), true);
  c.send("stopped", { taskId: stopped });
  const denied = await c.next();
  assert.equal(denied.event, "stop_fenced");
  assert.equal(denied.blocked, true);
  assert.equal(await db.collection("l3_effects").countDocuments({ taskId: stopped }), 0);
  cases.push("Stop fences fresh workers");
  console.log(JSON.stringify({ l3Recovery: "PASS", processes: 3,
    historyTurns: 1000, unrelatedTurns: 180, compactionMarkers: 4,
    effects: 2, replays: 0, cases, elapsedMs: Date.now() - start,
    realMongo: true, twoNextHosts: false, sharedFilesystemCheckpoints: false,
    modelCalls: false, externalCalls: false }, null, 2));
} finally {
  await Promise.all([...children].map(kill));
  try {
    if (created) {
      const marker = await db.collection("l3_test_run").findOne({ _id: "marker" });
      if (marker?.runId !== runId || marker.purpose !== "isolated_long_session_l3")
        throw Error("L3 marker changed; refusing database removal");
      await db.dropDatabase();
    }
  } finally { await client.close(); }
}
