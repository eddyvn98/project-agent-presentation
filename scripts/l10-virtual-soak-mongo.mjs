import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";
import { COMPACTION_LEASE_COLLECTION, compactionKey,
  claimCompaction, finishCompaction, releaseCompaction,
  stopCompaction } from "../lib/project-agent/compact-lease-core.mjs";
import { CHECKPOINT_COLLECTION, appendSharedCheckpoint,
  listSharedCheckpoints } from "../lib/project-agent/runtime/checkpoint-core.mjs";

const url = new URL(process.env.L10_MONGO_URI ?? "");
assert.equal(process.env.L10_ISOLATED_QA, "1", "L10 requires explicit isolation opt-in");
assert.ok(url.protocol === "mongodb:" && url.hostname === "127.0.0.1" &&
  url.port === "27019" && ["", "/"].includes(url.pathname) &&
  !url.username && !url.password && !url.search && !url.hash,
  "L10 refuses any nonisolated MongoDB endpoint");
const runId = randomBytes(6).toString("hex");
const dbName = "l10_soak_qa_" + runId;
const clients = [];
const clientAt = async index => {
  if (!clients[index]) {
    const client = new MongoClient(url.toString(), {
      directConnection: true, serverSelectionTimeoutMS: 4000,
    });
    await client.connect();
    clients[index] = client;
  }
  return clients[index];
};
const started = Date.now(), base = Date.UTC(2026, 9, 27);
const slots = Array.from({ length: 8 }, (_, i) => ({
  id: "chat-" + i, projectId: "l10-project-" + (i % 3),
  ownerEmail: "owner-" + (i % 4) + "@project-agent.test",
}));
let db, created = false;
const report = { l10: "PASS", virtualHours: 48, cycles: 96,
  parallelChats: slots.length, claims: 0, crashes: 0, stops: 0,
  staleRejected: 0, completed: 0, reconnects: 0,
  checkpoints: 0, orphans: 0, realElapsedMs: 0,
  realMongo: true, externalActions: false, modelCalls: false };
try {
  // Preconnect every slot before parallel work; otherwise concurrent first-use
  // calls can create untracked Mongo clients and keep the CI process alive.
  for (let index = 0; index < 4; index++) await clientAt(index);
  db = clients[0].db(dbName);
  assert.equal((await db.listCollections().toArray()).length, 0);
  await db.collection("l10_test_run").insertOne({
    _id: "marker", runId, purpose: "isolated_virtual_soak",
  });
  created = true;
  const virtualMs = step => base + step * 30 * 60000;
  for (let cycle = 0; cycle < report.cycles; cycle++) {
    await Promise.all(slots.map(async (slot, index) => {
      const conn = await clientAt(index % 4);
      const coll = conn.db(dbName).collection(COMPACTION_LEASE_COLLECTION);
      const scope = { projectId: slot.projectId, ownerEmail: slot.ownerEmail,
        conversationId: slot.id };
      const now = virtualMs(cycle);
      const claim = await claimCompaction(coll, scope,
        slot.id + "-source-" + cycle, now);
      assert.ok(claim, "Each expired or released slot must be reclaimable");
      report.claims++;
      if (cycle % 11 === 0 && cycle < 95) {
        // The worker disappears without releasing its lease.
        report.crashes++;
      } else if (cycle % 13 === 0) {
        assert.equal(await stopCompaction(coll, scope), true);
        report.stops++;
        assert.equal(await finishCompaction(coll, claim, "stale", now), false);
        report.staleRejected++;
      } else {
        assert.equal(await finishCompaction(coll, claim, "dify-" + cycle, now), true);
        report.completed++;
        assert.equal(await finishCompaction(coll, claim, "duplicate", now), false);
        report.staleRejected++;
      }
      if (cycle % 6 === 0) {
        const cp = conn.db(dbName).collection(CHECKPOINT_COLLECTION);
        await appendSharedCheckpoint(cp, {
          projectId: slot.projectId, chatId: slot.id,
        }, { taskId: "task-" + slot.id, step: cycle, action: "soak",
          failed: false, observation: "verified-" + cycle },
        new Date(now));
        report.checkpoints++;
      }
    }));
    if (cycle % 12 === 11) {
      const index = Math.floor(cycle / 12) % 4;
      await clients[index].close();
      clients[index] = null;
      await clientAt(index);
      report.reconnects++;
    }
  }
  const finalNow = virtualMs(96);
  for (const slot of slots) {
    const scope = { projectId: slot.projectId, ownerEmail: slot.ownerEmail,
      conversationId: slot.id };
    const coll = clients[0].db(dbName).collection(COMPACTION_LEASE_COLLECTION);
    const finalClaim = await claimCompaction(coll, scope, slot.id + "-final", finalNow);
    assert.ok(finalClaim, "No abandoned claim must block recovery");
    assert.equal(await releaseCompaction(coll, finalClaim), true);
    const row = await coll.findOne({ _id: compactionKey(scope) });
    assert.equal(row.state, "idle");
    assert.equal(row.leaseUntil, undefined);
    const checkpoint = await listSharedCheckpoints(
      clients[1].db(dbName).collection(CHECKPOINT_COLLECTION),
      { projectId: slot.projectId, chatId: slot.id }, undefined, new Date(finalNow));
    assert.ok(checkpoint.length > 0 && checkpoint.length <= 16);
  }
  report.orphans = await clients[0].db(dbName).collection(COMPACTION_LEASE_COLLECTION)
    .countDocuments({ state: "active" });
  assert.equal(report.orphans, 0);
  assert.equal(report.claims, 96 * slots.length);
  report.realElapsedMs = Date.now() - started;
  console.log(JSON.stringify(report, null, 2));
} finally {
  try {
    if (created) {
      const marker = await clients[0].db(dbName).collection("l10_test_run").findOne({ _id: "marker" });
      if (marker?.runId !== runId || marker.purpose !== "isolated_virtual_soak")
        throw Error("QA marker changed: refusing to drop database");
      await clients[0].db(dbName).dropDatabase();
    }
  } finally {
    await Promise.all(clients.filter(Boolean).map(client => client.close()));
  }
}
