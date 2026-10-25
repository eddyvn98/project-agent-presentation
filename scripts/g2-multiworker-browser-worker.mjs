import {
  claimBrowserLease, assertBrowserLease, changeBrowserControl,
  finishBrowserLease,
} from "../lib/project-agent/runtime/browser-agent/g2-lease-core.mjs";

const id = process.argv[2], dbName = process.env.G2_MW_DATABASE ?? "";
const url = new URL(process.env.G2_MW_MONGO_URI ?? "");
if (process.env.G2_ISOLATED_QA !== "1" ||
    process.env.G2_MULTIWORKER_MONGO_QA !== "1" ||
    url.protocol !== "mongodb:" || url.hostname !== "127.0.0.1" ||
    url.port !== "27019" || !["", "/"].includes(url.pathname) ||
    !/^g2_multiworker_qa_[a-f0-9]{12}$/.test(dbName) ||
    !/^pat_[a-f0-9]{12}$/.test(id))
  throw new Error("Refusing non-isolated G2 browser worker");
const { MongoClient } = await import("mongodb");
const client = new MongoClient(url.toString(), {
  directConnection: true, serverSelectionTimeoutMS: 5000,
});
await client.connect();
const db = client.db(dbName), coll = db.collection("projectAgentBrowserOwnership");
const actionLog = db.collection("g2_test_actions");
const marker = await db.collection("g2_test_run").findOne({ _id: "marker" });
if (marker?.runId !== process.env.G2_MW_RUN_ID ||
    marker?.purpose !== "isolated_g2_browser_lease")
  throw new Error("G2 run marker mismatch");
const owner = "g2-owner@project-agent.test";
const workerId = process.env.G2_MW_WORKER_ID ?? "";
let lease = null;
const send = (event, detail) => process.send?.({ event, detail });
send("ready");
process.on("message", async message => {
  try {
    if (message.op === "claim") {
      lease = await claimBrowserLease(coll, id, owner, workerId);
      send(lease ? "claimed" : "lost", lease?.epoch);
    } else if (message.op === "agent") {
      try {
        await assertBrowserLease(coll, lease, "agent");
        await actionLog.insertOne({ taskId: id, kind: "agent", workerId });
        send("agent_action");
      } catch { send("fenced"); }
    } else if (message.op === "takeover") {
      const revision = await changeBrowserControl(coll, lease, "agent", "human");
      send("human_owner", revision);
    } else if (message.op === "manual") {
      await assertBrowserLease(coll, lease, "human");
      await actionLog.insertOne({ taskId: id, kind: "human", workerId });
      send("human_action");
    } else if (message.op === "release") {
      const revision = await changeBrowserControl(coll, lease, "human", "agent");
      send("agent_owner", revision);
    } else if (message.op === "close") {
      send(await finishBrowserLease(coll, lease) ? "closed" : "fenced");
    } else send("error", "Unknown worker command");
  } catch (error) {
    send("error", error instanceof Error ? error.message : "worker error");
  }
});
process.on("disconnect", () => { void client.close().finally(() => process.exit(0)); });
