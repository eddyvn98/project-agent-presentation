import assert from "node:assert/strict";
import { isolatedMemoryQa } from "./l11-qa-db.mjs";
import { COMPACTION_LEASE_COLLECTION, claimCompaction, finishCompaction,
  stopCompaction, releaseCompaction } from "../lib/project-agent/compact-lease-core.mjs";
import { CHECKPOINT_COLLECTION, appendSharedCheckpoint, listSharedCheckpoints,
  deleteSharedCheckpoints } from "../lib/project-agent/runtime/checkpoint-core.mjs";

await isolatedMemoryQa("l19l22", async ({ db }) => {
  const schedules = db.collection("projectAgentSchedules");
  const leases = db.collection(COMPACTION_LEASE_COLLECTION);
  const checkpoints = db.collection(CHECKPOINT_COLLECTION);
  const now = Date.UTC(2026, 9, 27, 13, 0, 0);
  const due = new Date(now - 1000).toISOString();
  const total = 1000;
  const rows = Array.from({ length: total }, (_, i) => ({
    _id: "sat_" + i.toString(16).padStart(12, "0"),
    id: "sat_" + i.toString(16).padStart(12, "0"),
    ownerEmail: "user-" + (i % 20) + "@project-agent.test",
    projectId: "project-" + (i % 5),
    status: "active", revision: 0, nextRunAt: due,
    runs: [], prompt: "synthetic scheduled QA", title: "qa", spec: {
      kind: "interval", timezone: "UTC", everyMinutes: 15 },
  }));
  await schedules.insertMany(rows);
  let claims = 0, conflicts = 0, replayBlocked = 0, stopped = 0, crashes = 0;
  const claimsByOccurrence = new Set();
  // 1000 synthetic due occurrences with eight concurrent contenders on each CAS
  // row. This probes the revision/activeRun Mongo contract used by the scheduler.
  for (let start = 0; start < rows.length; start += 50) {
    await Promise.all(rows.slice(start, start + 50).map(async row => {
      const occurrence = row.nextRunAt, key = row._id + ":" + occurrence;
      const candidates = await Promise.all(Array.from({ length: 8 }, async () => {
        const result = await schedules.updateOne({
          _id: row._id, ownerEmail: row.ownerEmail, revision: 0,
          status: "active", activeRun: { $exists: false }, nextRunAt: occurrence,
        }, {
          $inc: { revision: 1 },
          $set: { activeRun: occurrence },
          $push: { runs: { occurrence, status: "dispatching" } },
        });
        return result.modifiedCount;
      }));
      assert.equal(candidates.reduce((a, b) => a + b, 0), 1);
      claims++; conflicts += 7;
      assert.equal(claimsByOccurrence.has(key), false);
      claimsByOccurrence.add(key);
      const replay = await schedules.updateOne({
        _id: row._id, revision: 0, activeRun: { $exists: false },
      }, { $set: { activeRun: occurrence } });
      assert.equal(replay.modifiedCount, 0);
      replayBlocked++;
    }));
  }
  assert.equal(claims, 1000);
  assert.equal(await schedules.countDocuments({ activeRun: due }), total);
  assert.equal(await schedules.countDocuments({ revision: 1 }), total);

  // L22 combines schedule CAS, checkpoint recovery, compaction fencing and
  // simulated Stop/restart on the same scoped conversation; no external calls.
  let fenced = 0, recovered = 0, receipts = 0;
  for (let i = 0; i < 120; i++) {
    const row = rows[i];
    const scope = { projectId: row.projectId, ownerEmail: row.ownerEmail,
      conversationId: "task-" + i };
    const outputScope = { projectId: row.projectId, chatId: scope.conversationId };
    const claim = await claimCompaction(leases, scope, row._id);
    assert.ok(claim);
    await appendSharedCheckpoint(checkpoints, outputScope, {
      taskId: row._id, step: 1, action: "schedule", failed: false,
      observation: "synthetic checkpoint " + i,
    });
    receipts++;
    if (i % 4 === 0) {
      // Stop between checkpoint and compact commit, disallow stale publishing.
      assert.equal(await stopCompaction(leases, scope), true);
      assert.equal(await finishCompaction(leases, claim, "unsafe"), false);
      fenced++; stopped++;
    } else if (i % 5 === 0) {
      // Simulated process crash before commit: force only its QA lease to expire.
      await leases.updateOne({ _id: claim.id, token: claim.token },
        { $set: { leaseUntil: new Date(0).toISOString() } });
      const next = await claimCompaction(leases, scope, row._id + "-recovery");
      assert.ok(next && next.epoch > claim.epoch);
      assert.equal(await finishCompaction(leases, claim, "stale"), false);
      fenced++; crashes++;
      assert.equal(await finishCompaction(leases, next, "safe"), true);
      recovered++;
    } else {
      assert.equal(await finishCompaction(leases, claim, "safe"), true);
    }
    const restored = await listSharedCheckpoints(checkpoints, outputScope);
    assert.equal(restored.length, 1);
    assert.equal(restored[0].observation, "synthetic checkpoint " + i);
    // Deletion and release are independent of who won the scheduler CAS.
    assert.equal(await deleteSharedCheckpoints(checkpoints, outputScope), true);
    assert.deepEqual(await listSharedCheckpoints(checkpoints, outputScope), []);
  }
  assert.equal(await leases.countDocuments({ state: "active" }), 0);
  assert.equal(await checkpoints.countDocuments({}), 0);
  console.log(JSON.stringify({
    l19: "PASS", scheduledOccurrences: total, contendingClaims: total * 8,
    claims, conflicts, replayBlocked, realMongo: true, actualTaskDispatch: false,
    l22: "PASS", compositeCycles: 120, receipts, stops: stopped, crashes,
    fencedStaleCommits: fenced, recovered, orphanLeases: 0, residualCheckpoints: 0,
    realBrowser: false, realModel: false,
  }, null, 2));
});
