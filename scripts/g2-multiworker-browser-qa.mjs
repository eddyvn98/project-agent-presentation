import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { fork } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  quarantineExpiredBrowser, acknowledgeBrowserRecovery, stopBrowserLease,
} from "../lib/project-agent/runtime/browser-agent/g2-lease-core.mjs";

if (process.env.G2_ISOLATED_QA !== "1" ||
    process.env.G2_MULTIWORKER_MONGO_QA !== "1")
  throw Error("G2 DB QA requires two explicit opt-ins");
const url = new URL(process.env.G2_MW_MONGO_URI ?? "");
if (url.protocol !== "mongodb:" || url.hostname !== "127.0.0.1" ||
    url.port !== "27019" || !["", "/"].includes(url.pathname) ||
    url.username || url.password || url.search || url.hash)
  throw Error("G2 refuses all Mongo except bare 127.0.0.1:27019");
const { MongoClient } = await import("mongodb");
const runId = randomBytes(6).toString("hex");
const dbName = "g2_multiworker_qa_" + runId;
const childFile = resolve(dirname(fileURLToPath(import.meta.url)),
  "g2-multiworker-browser-worker.mjs");
const client = new MongoClient(url.toString(), {
  directConnection: true, serverSelectionTimeoutMS: 5000,
});
const children = new Set();
let db, created = false;
const owner = "g2-owner@project-agent.test";
const newTask = () => "pat_" + randomBytes(6).toString("hex");
function spawn(id, workerId) {
  const child = fork(childFile, [id], {
    env: { ...process.env, G2_MW_DATABASE: dbName,
      G2_MW_RUN_ID: runId, G2_MW_WORKER_ID: workerId },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    execArgv: [], // No inherited --input-type flags from the parent.
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  const buffer = [], pending = [];
  child.on("message", msg => {
    if (pending.length) pending.shift()(msg); else buffer.push(msg);
  });
  const next = async () => {
    const msg = buffer.shift() ?? await new Promise((done, reject) => {
      const deliver = value => { clearTimeout(timer); done(value); };
      const timer = setTimeout(() => {
        const at = pending.indexOf(deliver);
        if (at >= 0) pending.splice(at, 1);
        reject(Error("G2 worker IPC timed out"));
      }, 10000);
      pending.push(deliver);
    });
    assert.notEqual(msg.event, "error", msg.detail ?? "worker error");
    return msg;
  };
  return { child, next, send: op => child.send({ op }) };
}
async function ready(id, name) {
  const worker = spawn(id, name);
  assert.equal((await worker.next()).event, "ready");
  return worker;
}
async function events(id) {
  return db.collection("g2_test_actions").find({ taskId: id }).toArray();
}
async function race() {
  const id = newTask(), a = await ready(id, "race-a"), b = await ready(id, "race-b");
  a.send("claim"); b.send("claim");
  const states = [await a.next(), await b.next()];
  assert.deepEqual(states.map(x => x.event).sort(), ["claimed", "lost"]);
  const winner = states[0].event === "claimed" ? a : b;
  const loser = winner === a ? b : a;
  winner.send("agent"); loser.send("agent");
  assert.equal((await winner.next()).event, "agent_action");
  assert.equal((await loser.next()).event, "fenced");
  assert.equal((await events(id)).length, 1);
  winner.send("close");
  assert.equal((await winner.next()).event, "closed");
  return { case: "atomic_claim_exactly_one_action", pass: true };
}
async function humanTakeover() {
  const id = newTask(), a = await ready(id, "human-a"), b = await ready(id, "human-b");
  a.send("claim"); assert.equal((await a.next()).event, "claimed");
  b.send("claim"); assert.equal((await b.next()).event, "lost");
  a.send("takeover");
  const pause = await a.next();
  assert.equal(pause.event, "human_owner");
  b.send("agent"); assert.equal((await b.next()).event, "fenced");
  a.send("manual"); assert.equal((await a.next()).event, "human_action");
  a.send("release");
  const release = await a.next();
  assert.equal(release.event, "agent_owner");
  assert.ok(release.detail > pause.detail);
  a.send("agent"); assert.equal((await a.next()).event, "agent_action");
  assert.deepEqual((await events(id)).map(x => x.kind), ["human", "agent"]);
  a.send("close"); assert.equal((await a.next()).event, "closed");
  return { case: "owner_scoped_human_takeover_and_handback", pass: true };
}
async function crashRecover() {
  const id = newTask(), a = await ready(id, "dead-owner");
  a.send("claim");
  assert.equal((await a.next()).event, "claimed");
  await new Promise(resolve => { a.child.once("exit", resolve); a.child.kill("SIGKILL"); });
  const coll = db.collection("projectAgentBrowserOwnership");
  const old = await coll.findOne({ _id: id });
  assert.ok(old?.epoch === 1);
  await coll.updateOne({ _id: id, state: "agent" },
    { $set: { leaseUntil: "2000-01-01T00:00:00.000Z" } });
  assert.equal(await quarantineExpiredBrowser(coll, id), true);
  const b = await ready(id, "replacement");
  b.send("claim"); assert.equal((await b.next()).event, "lost");
  assert.deepEqual(await events(id), []); // Never replay the crashed action.
  await assert.rejects(acknowledgeBrowserRecovery(coll, id, owner, false), /review/);
  assert.equal(await acknowledgeBrowserRecovery(coll, id, owner, true), true);
  b.send("claim");
  const recovered = await b.next();
  assert.equal(recovered.event, "claimed");
  assert.ok(recovered.detail > old.epoch);
  b.send("agent"); assert.equal((await b.next()).event, "agent_action");
  assert.equal((await events(id)).length, 1);
  b.send("close"); assert.equal((await b.next()).event, "closed");
  return { case: "crash_quarantine_explicit_fresh_restart", pass: true };
}
async function crashAfterAction() {
  const id = newTask(), a = await ready(id, "effect-before-crash");
  a.send("claim"); assert.equal((await a.next()).event, "claimed");
  a.send("agent"); assert.equal((await a.next()).event, "agent_action");
  assert.equal((await events(id)).length, 1);
  await new Promise(resolve => { a.child.once("exit", resolve); a.child.kill("SIGKILL"); });
  const coll = db.collection("projectAgentBrowserOwnership");
  await coll.updateOne({ _id: id, state: "agent" },
    { $set: { leaseUntil: "2000-01-01T00:00:00.000Z" } });
  assert.equal(await quarantineExpiredBrowser(coll, id), true);
  const b = await ready(id, "no-replay");
  b.send("claim"); assert.equal((await b.next()).event, "lost");
  b.send("agent"); assert.equal((await b.next()).event, "fenced");
  assert.equal((await events(id)).length, 1);
  assert.equal((await coll.findOne({ _id: id })).state, "quarantined");
  return { case: "crash_after_effect_quarantines_without_replay", pass: true };
}
async function remoteStop() {
  const id = newTask(), a = await ready(id, "stopped-a"), b = await ready(id, "stopped-b");
  a.send("claim"); assert.equal((await a.next()).event, "claimed");
  assert.equal(await stopBrowserLease(db.collection("projectAgentBrowserOwnership"),
    id, owner), true);
  a.send("agent"); assert.equal((await a.next()).event, "fenced");
  b.send("claim"); assert.equal((await b.next()).event, "lost");
  assert.equal((await events(id)).length, 0);
  return { case: "remote_stop_fences_old_and_new", pass: true };
}
try {
  await client.connect();
  db = client.db(dbName);
  assert.equal((await db.listCollections().toArray()).length, 0,
    "Refusing to touch an existing G2 database");
  await db.collection("g2_test_run").insertOne({
    _id: "marker", runId, purpose: "isolated_g2_browser_lease",
  });
  created = true;
  const cases = [await race(), await humanTakeover(),
    await crashRecover(), await crashAfterAction(), await remoteStop()];
  console.log(JSON.stringify({ scope: "two_node_processes_real_mongo",
    cases, chromium: false, nextWorkers: false, externalCalls: false }, null, 2));
} finally {
  await Promise.all([...children].map(child => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once("exit", resolve);
    child.kill("SIGKILL");
  })));
  if (created) {
    const row = await db.collection("g2_test_run").findOne({ _id: "marker" });
    if (row?.runId === runId && row.purpose === "isolated_g2_browser_lease")
      await db.dropDatabase();
  }
  await client.close();
}
