import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { fork } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
const url = new URL(process.env.L3B_MONGO_URI ?? "");
assert.equal(process.env.L3B_ISOLATED_QA, "1");
assert.ok(url.protocol === "mongodb:" && url.hostname === "127.0.0.1" &&
  url.port === "27019" && ["", "/"].includes(url.pathname) &&
  !url.username && !url.password && !url.search && !url.hash);
const runId = randomBytes(6).toString("hex"), name = "l3b_checkpoint_qa_" + runId;
const client = new MongoClient(url.toString(), { directConnection: true, serverSelectionTimeoutMS: 3000 });
const worker = resolve(dirname(fileURLToPath(import.meta.url)), "l3b-checkpoint-host.mjs");
const processes = [];
let db, created = false;
async function start(nameOfHost) {
  const child = fork(worker, [], { env: { ...process.env, L3B_DB: name,
    L3B_RUN_ID: runId, L3B_HOST_NAME: nameOfHost },
    stdio: ["ignore", "ignore", "pipe", "ipc"], execArgv: [] });
  processes.push(child);
  const ready = await Promise.race([
    new Promise((done, reject) => {
      child.once("message", msg => msg.event === "ready" ? done(msg) : reject(Error("Bad host event")));
      child.once("exit", code => reject(Error("L3B host exited " + code)));
    }),
    new Promise((_, reject) => setTimeout(() => reject(Error("L3B host timeout")), 10000)),
  ]);
  return { child, port: ready.port };
}
async function kill(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(done => child.once("exit", done));
  child.kill("SIGKILL"); await exited;
}
async function call(host, method, scope, body, auth = true) {
  const response = await fetch("http://127.0.0.1:" + host.port + "/", {
    method, headers: { "x-l3b-token": auth ? "l3b-" + runId : "bad",
      "x-project-id": scope.projectId, "x-chat-id": scope.chatId,
      "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { code: response.status, data: await response.json() };
}
const scope = { projectId: "project-l3b", chatId: "chat-l3b" };
const wrongProject = { projectId: "other-project", chatId: "chat-l3b" };
const wrongChat = { projectId: "project-l3b", chatId: "other-chat" };
const cases = [];
try {
  await client.connect(); db = client.db(name);
  assert.equal((await db.listCollections().toArray()).length, 0);
  await db.collection("l3b_run").insertOne({
    _id: "marker", runId, purpose: "l3b_shared_checkpoint_qa" }); created = true;
  const a = await start("host-a"), b = await start("host-b");
  assert.notEqual(a.child.pid, b.child.pid);
  assert.notEqual(a.port, b.port);
  const event = { taskId: "task-one", step: 1, action: "shell",
    failed: false, observation: "verified Blue design before crash" };
  assert.equal((await call(a, "POST", scope, event)).code, 200);
  assert.equal((await call(b, "GET", scope)).data.entries[0].observation, event.observation);
  assert.equal((await call(b, "GET", wrongChat)).data.entries.length, 0);
  assert.equal((await call(b, "GET", wrongProject)).data.entries.length, 0);
  assert.equal((await call(b, "GET", scope, null, false)).code, 403);
  cases.push("two independent HTTP hosts share scoped Mongo checkpoint");
  await kill(a.child);
  assert.equal((await call(b, "GET", scope)).data.entries[0].observation, event.observation);
  const c = await start("host-c");
  assert.equal((await call(c, "GET", scope)).data.entries.length, 1);
  cases.push("SIGKILL host-A then restart host-C; persisted checkpoint survives");
  for (let i = 2; i <= 100; i++) {
    const target = i % 2 ? b : c;
    assert.equal((await call(target, "POST", scope, { ...event, step: i })).code, 200);
  }
  const entries = (await call(b, "GET", scope)).data.entries;
  assert.equal(entries.length, 16);
  assert.deepEqual(entries.map(e => e.step), Array.from({ length: 16 }, (_, i) => 85 + i));
  cases.push("concurrent hosts append without lost updates; last-16 bounded retention");
  assert.equal((await call(c, "DELETE", wrongProject)).data.deleted, false);
  assert.equal((await call(c, "DELETE", scope)).data.deleted, true);
  assert.equal((await call(b, "GET", scope)).data.entries.length, 0);
  cases.push("cross-host deletion and owner-scope isolation");
  console.log(JSON.stringify({ l3b: "PASS", hosts: 3, cases,
    realMongo: true, nextJsHosts: false, modelCalls: false, externalCalls: false }, null, 2));
} finally {
  await Promise.all(processes.map(kill));
  if (created) {
    const marker = await db.collection("l3b_run").findOne({ _id: "marker" });
    if (marker?.runId !== runId || marker?.purpose !== "l3b_shared_checkpoint_qa")
      throw Error("L3B marker changed; refusing cleanup");
    await db.dropDatabase();
  }
  await client.close();
}
