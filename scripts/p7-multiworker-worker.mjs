import { randomUUID } from "node:crypto";

const id = process.argv[2], dbName = process.env.P7_MW_DATABASE ?? "";
const uri = process.env.P7_MW_MONGO_URI ?? "";
const url = new URL(uri);
if (process.env.P7_ISOLATED_QA !== "1" || process.env.P7_MULTIWORKER_MONGO_QA !== "1" ||
    url.protocol !== "mongodb:" || url.hostname !== "127.0.0.1" || url.port !== "27019" ||
    !/^p7_multiworker_qa_[a-f0-9]{12}$/.test(dbName) ||
    !/^pat_[a-f0-9]{12}$/.test(id)) throw new Error("Refusing non-isolated P7 Mongo worker");
const { MongoClient } = await import("mongodb");
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
await client.connect();
const db = client.db(dbName), queue = db.collection("projectAgentDurableTasks");
const tasks = db.collection("project_agent_tasks");
const actions = db.collection("p7_test_actions");
const marker = await db.collection("p7_test_run").findOne({ _id: "marker" });
if (marker?.runId !== process.env.P7_MW_RUN_ID) throw new Error("QA run marker mismatch");
const send = msg => process.send?.(msg);
async function execute() {
  const now = new Date().toISOString(), token = randomUUID();
  const claimed = await queue.findOneAndUpdate({ _id: id, state: "queued" }, {
    $set: { state: "running", leaseToken: token, startedAt: now,
      leaseUntil: new Date(Date.now() + 120000).toISOString() },
    $inc: { attempt: 1 },
  }, { returnDocument: "after" });
  const row = claimed?.value ?? claimed;
  if (!row || row.leaseToken !== token) { send({ event: "lost" }); return; }
  send({ event: "claimed" });
  await new Promise(resolve => process.once("message", msg => {
    if (msg === "resume") resolve();
  }));
  // The production tool fence checks the same queue token and expiration.
  const stillOwned = await queue.findOne({ _id: id, state: "running",
    leaseToken: token, leaseUntil: { $gt: new Date().toISOString() } });
  const task = await tasks.findOne({ _id: id, cancelled: { $ne: true },
    status: { $in: ["queued", "running"] } });
  if (!stillOwned || !task) { send({ event: "fenced" }); return; }
  await actions.insertOne({ taskId: id, executedAt: new Date().toISOString() });
  await tasks.updateOne({ _id: id }, { $set: { status: "done" } });
  await queue.updateOne({ _id: id, leaseToken: token, state: "running" }, {
    $set: { state: "done", completedAt: new Date().toISOString() },
    $unset: { leaseToken: "", leaseUntil: "" },
  });
  send({ event: "committed" });
}
send({ event: "ready" });
try {
  await new Promise(resolve => process.once("message", msg => {
    if (msg === "go") resolve();
  }));
  await execute();
} catch (error) {
  send({ event: "error", message: error instanceof Error ? error.message : "worker error" });
  process.exitCode = 1;
} finally { await client.close(); }
