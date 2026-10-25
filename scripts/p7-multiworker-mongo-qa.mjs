import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { fork } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.P7_ISOLATED_QA !== "1" || process.env.P7_MULTIWORKER_MONGO_QA !== "1")
  throw new Error("This test requires two explicit isolated-QA opt-ins");
const uri = process.env.P7_MW_MONGO_URI ?? "";
const address = new URL(uri);
if (address.protocol !== "mongodb:" || address.hostname !== "127.0.0.1" ||
    address.port !== "27019" || !["", "/"].includes(address.pathname))
  throw new Error("Refusing non-loopback or non-QA MongoDB (require 127.0.0.1:27019)");
const { MongoClient } = await import("mongodb"); // Available in AI-WEB-CHAT host.
const runId = randomBytes(6).toString("hex");
const dbName = "p7_multiworker_qa_" + runId;
const client = new MongoClient(uri, { directConnection: true, serverSelectionTimeoutMS: 5000 });
const workerFile = resolve(dirname(fileURLToPath(import.meta.url)), "p7-multiworker-worker.mjs");
const children = new Set();
const env = { ...process.env, P7_MW_DATABASE: dbName, P7_MW_RUN_ID: runId };
let database, created = false;
function spawn(id) {
  const child = fork(workerFile, [id], { env, stdio: ["ignore", "ignore", "pipe", "ipc"] });
  children.add(child);
  const pending = [], waiters = [];
  child.on("message", msg => {
    if (waiters.length) waiters.shift()(msg); else pending.push(msg);
  });
  child.on("exit", () => children.delete(child));
  return {
    child, send: msg => child.send(msg),
    next: async () => {
      const msg = await Promise.race([
        pending.length ? Promise.resolve(pending.shift()) : new Promise(resolve => waiters.push(resolve)),
        new Promise((_, reject) => setTimeout(() => reject(new Error("QA worker event timeout")), 10000)),
      ]);
      assert.notEqual(msg.event, "error", msg.message ?? "worker error");
      return msg.event;
    },
  };
}
const makeId = () => "pat_" + randomBytes(6).toString("hex");
async function seed(id) {
  const now = new Date().toISOString();
  await database.collection("projectAgentDurableTasks").insertOne({
    _id: id, taskId: id, state: "queued", queuedAt: now, attempt: 0,
  });
  await database.collection("project_agent_tasks").insertOne({
    _id: id, id, status: "queued", cancelled: false, projectId: "proj_p7_multiworker_qa",
    ownerEmail: "p7-worker@project-agent.test", prompt: "[P7 QA] Synthetic lease only",
    createdAt: now, updatedAt: now,
  });
}
async function actions(id) {
  return database.collection("p7_test_actions").countDocuments({ taskId: id });
}
async function scenarioRace() {
  const id = makeId(); await seed(id);
  const a = spawn(id), b = spawn(id);
  assert.equal(await a.next(), "ready"); assert.equal(await b.next(), "ready");
  a.send("go"); b.send("go");
  const events = await Promise.all([a.next(), b.next()]);
  assert.deepEqual(events.slice().sort(), ["claimed", "lost"]);
  (events[0] === "claimed" ? a : b).send("resume");
  assert.equal(await (events[0] === "claimed" ? a : b).next(), "committed");
  assert.equal(await actions(id), 1);
  assert.equal((await database.collection("projectAgentDurableTasks").findOne({ _id: id })).state, "done");
  return { case: "simultaneous_two_workers", actions: 1, pass: true };
}
async function scenarioRestart() {
  const id = makeId(); await seed(id);
  const a = spawn(id); assert.equal(await a.next(), "ready"); a.send("go");
  assert.equal(await a.next(), "claimed");
  await new Promise(resolve => { a.child.once("exit", resolve); a.child.kill("SIGKILL"); });
  const queue = database.collection("projectAgentDurableTasks");
  await queue.updateOne({ _id: id, state: "running" }, {
    $set: { leaseUntil: "2000-01-01T00:00:00.000Z" },
  }); // Fast-forward expiry; never wait for the 120-second TTL.
  const row = await queue.findOne({ _id: id, state: "running",
    leaseUntil: { $lt: new Date().toISOString() } });
  assert.ok(row, "Expired task must be visible to scanner");
  const changed = await queue.updateOne({ _id: id, state: "running",
    leaseToken: row.leaseToken, leaseUntil: { $lt: new Date().toISOString() } }, {
    $set: { state: "needs_review", error: "Worker interrupted; review external effects" },
    $unset: { leaseToken: "", leaseUntil: "" },
  });
  assert.equal(changed.modifiedCount, 1);
  const b = spawn(id); assert.equal(await b.next(), "ready"); b.send("go");
  assert.equal(await b.next(), "lost");
  assert.equal(await actions(id), 0);
  return { case: "crash_expiry_quarantine", actions: 0, pass: true };
}
async function scenarioStop() {
  const id = makeId(); await seed(id);
  const a = spawn(id); assert.equal(await a.next(), "ready"); a.send("go");
  assert.equal(await a.next(), "claimed");
  await database.collection("project_agent_tasks").updateOne({ _id: id }, {
    $set: { status: "failed", cancelled: true },
  });
  const result = await database.collection("projectAgentDurableTasks").updateOne({
    _id: id, state: { $in: ["queued", "running"] },
  }, {
    $set: { state: "failed", error: "Stopped by you." },
    $unset: { leaseToken: "", leaseUntil: "" },
  });
  assert.equal(result.modifiedCount, 1);
  a.send("resume"); assert.equal(await a.next(), "fenced");
  const b = spawn(id); assert.equal(await b.next(), "ready"); b.send("go");
  assert.equal(await b.next(), "lost");
  assert.equal(await actions(id), 0);
  return { case: "remote_stop_fences_old_and_new_workers", actions: 0, pass: true };
}
try {
  await client.connect();
  database = client.db(dbName);
  assert.equal((await database.listCollections().toArray()).length, 0,
    "Unexpected nonempty QA database; refusing modification");
  await database.collection("p7_test_run").insertOne({
    _id: "marker", runId, purpose: "isolated_multiworker_qa",
  });
  created = true;
  const report = [await scenarioRace(), await scenarioRestart(), await scenarioStop()];
  console.log(JSON.stringify({ scope: "real_Mongo_two_OS_processes", cases: report,
    externallyCalled: false, productionReady: false }, null, 2));
} finally {
  for (const child of children) child.kill("SIGKILL");
  if (created) {
    const marker = await database.collection("p7_test_run").findOne({ _id: "marker" });
    if (marker?.runId === runId && marker.purpose === "isolated_multiworker_qa")
      await database.dropDatabase(); // Only our freshly generated one-off QA database.
  }
  await client.close();
}
