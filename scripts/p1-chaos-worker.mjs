import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { qaConnection } from "./p1-qa-mongo.mjs";
import { claimBrowserLease, assertBrowserLease } from
  "../lib/project-agent/runtime/browser-agent/g2-lease-core.mjs";

const dbName = process.env.P1_DATABASE || "";
assert.match(dbName, /^p1_chaos_qa_[0-9a-f]{12}$/);
assert.match(process.env.P1_RUN_ID || "", /^[0-9a-f]{12}$/);
const url = qaConnection();
const client = new MongoClient(url, { directConnection: true, serverSelectionTimeoutMS: 5000 });
await client.connect();
const db = client.db(dbName);
const marker = await db.collection("p1_test_marker").findOne({ _id: "marker" });
assert.equal(marker?.runId, process.env.P1_RUN_ID);
assert.equal(marker?.kind, "chaos");
assert.equal(marker?.purpose, "isolated_p1_agent_qa");
const leases = db.collection("projectAgentBrowserOwnership");
const actions = db.collection("p1_test_actions");
process.send?.({ event: "ready" });
process.on("message", async req => {
  try {
    assert.ok(["before", "after"].includes(req.mode));
    assert.match(req.id, /^pat_[0-9a-f]{12}$/);
    assert.match(req.owner, /^p1-owner-[0-3]@project-agent\.test$/);
    const lease = await claimBrowserLease(leases, req.id, req.owner, "crash-worker");
    assert.ok(lease);
    await assertBrowserLease(leases, lease);
    if (req.mode === "after") {
      await actions.insertOne({ taskId: req.id, owner: req.owner,
        kind: "agent", authorizedEpoch: lease.epoch });
    }
    process.send?.({ event: "effect_boundary", epoch: lease.epoch });
  } catch (e) { process.send?.({ event: "error", message: String(e) }); }
});
process.on("disconnect", () => { void client.close().finally(() => process.exit(0)); });
