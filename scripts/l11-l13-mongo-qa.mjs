import assert from "node:assert/strict";
import { isolatedMemoryQa } from "./l11-qa-db.mjs";
import { appendSharedCheckpoint, listSharedCheckpoints, checkpointScopeKey,
  deleteSharedCheckpoints, CHECKPOINT_COLLECTION } from
  "../lib/project-agent/runtime/checkpoint-core.mjs";
import { claimCompaction, finishCompaction, COMPACTION_LEASE_COLLECTION } from
  "../lib/project-agent/compact-lease-core.mjs";

const scope = { projectId: "project-L11", chatId: "chat-live" };
const event = { taskId: "task-live", step: 1, action: "tool",
  failed: false, observation: "verified-blue" };
const cases = [];
await isolatedMemoryQa("l11l13", async ({ db }) => {
  const coll = db.collection(CHECKPOINT_COLLECTION);
  const key = checkpointScopeKey(scope);
  await assert.rejects(appendSharedCheckpoint({
    updateOne: async () => { throw Error("before-write network outage"); },
  }, scope, event), /before-write/);
  assert.equal(await coll.countDocuments({ _id: key }), 0);
  await appendSharedCheckpoint(coll, scope, event);
  assert.equal((await listSharedCheckpoints(coll, scope)).length, 1);
  cases.push("L11 failure before commit produces no partial checkpoint");

  const postCommitLoss = {
    updateOne: async (...args) => {
      await coll.updateOne(...args);
      throw Error("acknowledgement lost after Mongo commit");
    },
  };
  await assert.rejects(appendSharedCheckpoint(postCommitLoss, scope,
    { ...event, step: 2, observation: "next verified" }), /acknowledgement lost/);
  await appendSharedCheckpoint(coll, scope, {
    ...event, step: 2, observation: "next verified" });
  const entries = await listSharedCheckpoints(coll, scope);
  assert.deepEqual(entries.map(x => x.step), [1, 2],
    "Retransmitted checkpoint must not duplicate a completed step");
  await assert.rejects(appendSharedCheckpoint(coll, scope, {
    ...event, step: 2, observation: "changed malicious payload",
  }), /collision/);
  cases.push("L11 lost ACK retry is idempotent; conflicting step is refused");

  const leases = db.collection(COMPACTION_LEASE_COLLECTION);
  const compactScope = { projectId: scope.projectId,
    ownerEmail: "qa-owner@project-agent.test", conversationId: scope.chatId };
  const claim = await claimCompaction(leases, compactScope, "source-task");
  assert.ok(claim);
  const ackLost = { updateOne: async (...args) => {
    await leases.updateOne(...args);
    throw Error("finish response lost");
  } };
  await assert.rejects(finishCompaction(ackLost, claim, "model-4"), /response lost/);
  assert.equal(await finishCompaction(leases, claim, "second-model"), false);
  assert.equal(await claimCompaction(leases, compactScope, "source-task"), null);
  cases.push("L11 compaction remains single-publish after final ACK loss");

  const unavailableDelete = { deleteOne: async () => { throw Error("db unavailable"); } };
  await assert.rejects(deleteSharedCheckpoints(unavailableDelete, scope), /unavailable/);
  assert.equal((await listSharedCheckpoints(coll, scope)).length, 2);
  assert.equal(await deleteSharedCheckpoints(coll, scope), true);
  cases.push("L11 failed checkpoint purge preserves data for safe retry");

  // L13: older/incompatible row is kept intact and never included in prompts.
  const old = { projectId: "p-legacy", chatId: "c-legacy" };
  const oldKey = checkpointScopeKey(old);
  await coll.insertOne({ _id: oldKey, projectId: old.projectId,
    chatId: old.chatId, entries: "broken-v0-array", schemaVersion: 0 });
  assert.deepEqual(await listSharedCheckpoints(coll, old), []);
  await assert.rejects(appendSharedCheckpoint(coll, old, event));
  const intact = await coll.findOne({ _id: oldKey });
  assert.equal(intact.entries, "broken-v0-array");
  assert.equal(intact.schemaVersion, 0);
  assert.equal(await deleteSharedCheckpoints(coll, old), true);
  await appendSharedCheckpoint(coll, old, event);
  assert.equal((await listSharedCheckpoints(coll, old)).length, 1);
  cases.push("L13 malformed v0 is not read or silently overwritten; explicit cleanup repairs");

  const expired = { projectId: "p-expired", chatId: "c-expired" };
  await coll.insertOne({ _id: checkpointScopeKey(expired),
    ...expired, expiresAt: new Date("2001-01-01T00:00:00Z"),
    entries: [{ ...event, at: new Date().toISOString() }] });
  assert.deepEqual(await listSharedCheckpoints(coll, expired), []);
  await appendSharedCheckpoint(coll, expired, { ...event, step: 3 });
  assert.equal((await listSharedCheckpoints(coll, expired)).length, 2);
  cases.push("L13 expired schema is not served; fresh append restores current TTL");
  console.log(JSON.stringify({ l11l13: "PASS", cases, realMongo: true,
    simulatedFailureSites: 4, legacyCorruptionPreserved: true,
    realMultiHost: false }, null, 2));
});
