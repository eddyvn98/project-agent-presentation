import { MongoClient } from "mongodb";
import { claimBrowserLease, assertBrowserLease, finishBrowserLease } from
  "../lib/project-agent/runtime/browser-agent/g2-lease-core.mjs";
const url = new URL(process.env.L3_MONGO_URI ?? "");
const name = process.env.L3_DB_NAME ?? "", runId = process.env.L3_RUN_ID ?? "";
if (process.env.L3_ISOLATED_QA !== "1" || url.protocol !== "mongodb:" ||
    url.hostname !== "127.0.0.1" || url.port !== "27019" ||
    !["", "/"].includes(url.pathname) || url.username || url.password ||
    url.search || url.hash || !/^l3_long_session_qa_[a-f0-9]{12}$/.test(name) ||
    !/^[a-f0-9]{12}$/.test(runId)) throw Error("L3 worker refuses non-isolated MongoDB");
const client = new MongoClient(url.toString(), { directConnection: true, serverSelectionTimeoutMS: 3000 });
await client.connect();
const db = client.db(name);
const marker = await db.collection("l3_test_run").findOne({ _id: "marker" });
if (marker?.runId !== runId || marker.purpose !== "isolated_long_session_l3") {
  await client.close();
  throw Error("L3 worker run marker mismatch");
}
const projectId = "l3_project", ownerEmail = "l3-owner@project-agent.test";
const chatId = "l3_chat", taskId = process.env.L3_TASK_ID ?? "";
if (!/^pat_[a-f0-9]{12}$/.test(taskId)) throw Error("Invalid L3 task");
const leases = db.collection("projectAgentBrowserOwnership");
const actions = db.collection("l3_effects");
const send = (event, data = {}) => process.send?.({ event, ...data });
let claim = null;
async function snapshot() {
  const filter = { projectId, ownerEmail, conversationId: chatId, status: "done" };
  const [turns, history, latest] = await Promise.all([
    db.collection("project_agent_tasks").countDocuments(filter),
    db.collection("project_agent_tasks").find(filter).sort({ createdAt: -1, _id: -1 }).limit(8).toArray(),
    db.collection("project_agent_tasks").findOne({ ...filter,
      difyConversationId: { $exists: true } }, { sort: { createdAt: -1, _id: -1 } }),
  ]);
  return { turns, recent: history.length,
    correction: history.find(row => row.userPrompt?.includes("BLUE"))?.resultText,
    modelId: latest?.difyConversationId,
    recentIds: history.map(row => row._id) };
}
send("ready");
process.on("message", async message => {
  try {
    if (message.op === "claim") {
      claim = await claimBrowserLease(leases, taskId, ownerEmail, message.worker);
      send(claim ? "claimed" : "fenced", { epoch: claim?.epoch });
    } else if (message.op === "effect") {
      await assertBrowserLease(leases, claim);
      const result = await actions.updateOne({ taskId, key: "external-effect-1" },
        { $setOnInsert: { taskId, key: "external-effect-1", worker: message.worker } }, { upsert: true });
      send("effect", { inserted: result.upsertedCount });
    } else if (message.op === "recover") {
      const history = await snapshot();
      const blocked = await claimBrowserLease(leases, taskId, ownerEmail, message.worker);
      send("recovery", { ...history, blocked: blocked === null,
        effects: await actions.countDocuments({ taskId }) });
    } else if (message.op === "continue") {
      await assertBrowserLease(leases, claim);
      const again = await actions.updateOne({ taskId, key: "external-effect-1" },
        { $setOnInsert: { taskId, key: "external-effect-1", worker: message.worker } }, { upsert: true });
      const next = await actions.updateOne({ taskId, key: "external-effect-2" },
        { $setOnInsert: { taskId, key: "external-effect-2", worker: message.worker } }, { upsert: true });
      send("continued", { replayed: again.upsertedCount,
        newActions: next.upsertedCount, effects: await actions.countDocuments({ taskId }) });
    } else if (message.op === "close") {
      send(await finishBrowserLease(leases, claim) ? "closed" : "fenced");
    } else if (message.op === "inspect") {
      send("inspected", { ...await snapshot(), effects: await actions.countDocuments({ taskId }) });
    } else if (message.op === "stopped") {
      const blocked = await claimBrowserLease(leases, message.taskId, ownerEmail, message.worker);
      send("stop_fenced", { blocked: blocked === null });
    } else if (message.op === "disconnect") {
      await client.close();
      let rejected = false;
      try { await db.collection("project_agent_tasks").findOne({ projectId }); }
      catch { rejected = true; }
      send("disconnected", { rejected });
    } else send("error", { detail: "Unknown worker command" });
  } catch (error) { send("error", { detail: error instanceof Error ? error.message : String(error) }); }
});
process.on("disconnect", () => { void client.close().finally(() => process.exit(0)); });
