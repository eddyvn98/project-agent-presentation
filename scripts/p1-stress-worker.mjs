import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { qaConnection } from "./p1-qa-mongo.mjs";
import { claimBrowserLease, assertBrowserLease } from
  "../lib/project-agent/runtime/browser-agent/g2-lease-core.mjs";

const dbName = process.env.P1_DATABASE || "", worker = process.env.P1_WORKER || "";
assert.match(dbName, /^p1_stress_qa_[0-9a-f]{12}$/);
assert.match(worker, /^stress-[0-9]{1,2}$/);
assert.match(process.env.P1_RUN_ID || "", /^[0-9a-f]{12}$/);
const client = new MongoClient(qaConnection(), { directConnection: true, serverSelectionTimeoutMS: 5000 });
await client.connect();
const db = client.db(dbName);
const marker = await db.collection("p1_test_marker").findOne({ _id: "marker" });
assert.equal(marker?.runId, process.env.P1_RUN_ID);
assert.equal(marker?.purpose, "isolated_p1_agent_qa");
assert.equal(marker?.kind, "stress");
const leases = db.collection("projectAgentBrowserOwnership");
const actions = db.collection("p1_test_actions");
const owners = Array.from({ length: 4 }, (_, i) => "p1-owner-" + i + "@project-agent.test");
const send = msg => process.send?.(msg);
send({ event: "ready" });

process.on("message", async request => {
  try {
    if (request.op !== "start" || !Array.isArray(request.ids) || request.ids.length > 250)
      throw Error("Invalid stress request");
    const start = Date.now();
    let claimed = 0, lost = 0, authorized = 0;
    for (const [index, id] of request.ids.entries()) {
      assert.match(id, /^pat_[0-9a-f]{12}$/);
      const owner = owners[index % owners.length];
      const lease = await claimBrowserLease(leases, id, owner, worker);
      if (!lease) { lost++; continue; }
      claimed++;
      await assertBrowserLease(leases, lease);
      await actions.insertOne({ taskId: id, owner, worker, kind: "agent",
        authorizedEpoch: lease.epoch });
      authorized++;
    }
    send({ event: "done", claimed, lost, authorized, elapsedMs: Date.now() - start });
  } catch (error) {
    send({ event: "error", message: String(error) });
  }
});
process.on("disconnect", () => { void client.close().finally(() => process.exit(0)); });
