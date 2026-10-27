import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { isolatedDb, connect, mongoAddress, newId } from "./p2-qa-db.mjs";
import { claimBrowserLease, assertBrowserLease, stopBrowserLease,
  quarantineExpiredBrowser, acknowledgeBrowserRecovery } from
  "../lib/project-agent/runtime/browser-agent/g2-lease-core.mjs";

assert.equal(process.env.P2_DOCKER_OUTAGE_QA, "1", "Real outage requires explicit opt-in");
assert.equal(process.env.CI, "true", "Real outage test only runs on isolated CI");
const url = mongoAddress(27029), runId = newId();
const name = "p2-mongo-qa-" + runId;
const docker = (...args) => execFileSync("docker", args, {
  encoding: "utf8", timeout: 50_000, stdio: ["ignore", "pipe", "pipe"],
}).trim();
const verify = () => {
  const label = docker("inspect", "--format",
    '{{index .Config.Labels "project-agent-p2-qa"}}', name);
  assert.equal(label, runId, "Refusing operation on an unmarked container");
};
const waitForMongo = async () => {
  let last;
  for (let attempt = 0; attempt < 30; attempt++) {
    const client = connect(url, 1200);
    try {
      await client.connect();
      await client.db("admin").command({ ping: 1 });
      return;
    } catch (e) { last = e; await new Promise(r => setTimeout(r, 500)); }
    finally { await client.close().catch(() => {}); }
  }
  throw Error("Isolated MongoDB unavailable after restart: " + last);
};
let started = false;
const began = Date.now();
try {
  docker("run", "-d", "--name", name, "--label", "project-agent-p2-qa=" + runId,
    "-p", "127.0.0.1:27029:27017", "mongo:7");
  started = true; verify(); await waitForMongo();
  const result = await isolatedDb(27029, "outage", async ({ db }) => {
    const id = "pat_" + newId(), owner = "p2-owner@project-agent.test";
    const coll = db.collection("projectAgentBrowserOwnership");
    const actions = db.collection("p2_verified_actions");
    const lease = await claimBrowserLease(coll, id, owner, "outage-worker");
    assert.ok(lease);
    await assertBrowserLease(coll, lease);
    await actions.insertOne({ taskId: id, epoch: lease.epoch, kind: "agent" });
    assert.equal(await actions.countDocuments({ taskId: id }), 1);
    verify();
    docker("stop", "-t", "2", name);
    await assert.rejects(assertBrowserLease(coll, lease),
      /server selection|connect|socket|closed|connection|network|topology|timed out/i);
    verify();
    docker("start", name);
    await waitForMongo();
    // The prior effect must persist; no action is issued during reconnection.
    const restored = connect(url, 3000);
    await restored.connect();
    try {
      const liveColl = restored.db(db.databaseName).collection("projectAgentBrowserOwnership");
      const restoredActions = restored.db(db.databaseName).collection("p2_verified_actions");
      const record = await liveColl.findOne({ _id: id });
      assert.equal(record.epoch, lease.epoch);
      assert.equal(record.state, "agent");
      assert.equal(await restoredActions.countDocuments({ taskId: id }), 1);
      // A killed/unknown worker must be quarantined before replacement gets control.
      await liveColl.updateOne({ _id: id, state: "agent" },
        { $set: { leaseUntil: "2000-01-01T00:00:00.000Z" } });
      await assert.rejects(assertBrowserLease(liveColl, lease), /lost/);
      assert.equal(await quarantineExpiredBrowser(liveColl, id), true);
      assert.equal(await claimBrowserLease(liveColl, id, owner, "unreviewed"), null);
      await assert.rejects(acknowledgeBrowserRecovery(liveColl, id, owner, false), /review/);
      assert.equal(await acknowledgeBrowserRecovery(liveColl, id, owner, true), true);
      const replacement = await claimBrowserLease(liveColl, id, owner, "reviewed-worker");
      assert.ok(replacement && replacement.epoch > lease.epoch);
      await assert.rejects(assertBrowserLease(liveColl, lease), /lost/);
      assert.ok(await assertBrowserLease(liveColl, replacement));
      assert.equal(await restoredActions.countDocuments({ taskId: id }), 1);
      assert.equal(await stopBrowserLease(liveColl, id, owner), true);
      return { containerStoppedAndRestarted: true, persistedEffects: 1,
        automaticReplays: 0, reviewedReplacementEpoch: replacement.epoch,
        staleWorkerRejected: true, externalCalls: false };
    } finally { await restored.close(); }
  });
  console.log(JSON.stringify({ p2RealMongoOutage: "PASS", ...result,
    elapsedMs: Date.now() - began }, null, 2));
} finally {
  if (started) {
    verify(); docker("rm", "-f", name);
  }
}
