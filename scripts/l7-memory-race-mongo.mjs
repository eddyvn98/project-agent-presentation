import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";
import { claimCompaction, finishCompaction, releaseCompaction, stopCompaction,
  COMPACTION_LEASE_COLLECTION } from "../lib/project-agent/compact-lease-core.mjs";
import { appendSharedCheckpoint, listSharedCheckpoints,
  CHECKPOINT_COLLECTION } from "../lib/project-agent/runtime/checkpoint-core.mjs";

const url = new URL(process.env.L7_MONGO_URI || "");
assert.equal(process.env.L7_ISOLATED_QA, "1", "Opt-in required");
assert.ok(url.protocol === "mongodb:" && url.hostname === "127.0.0.1" &&
  url.port === "27019" && ["", "/"].includes(url.pathname) &&
  !url.username && !url.password && !url.search && !url.hash,
  "L7 refuses non-isolated databases");
const runId = randomBytes(6).toString("hex"), dbName = "l7_memory_race_qa_" + runId;
const clients = Array.from({ length: 5 }, () => new MongoClient(url.toString(), {
  directConnection: true, serverSelectionTimeoutMS: 4000,
}));
const scope = { projectId: "p-a", ownerEmail: "alice@example.test", conversationId: "chat-a" };
const cases = [];
let db, created = false;
try {
  await Promise.all(clients.map(c => c.connect()));
  db = clients[0].db(dbName);
  assert.equal((await db.listCollections().toArray()).length, 0);
  await db.collection("l7_run").insertOne({ _id: "marker", runId, purpose: "l7_memory_race" });
  created = true;
  const coll = clients.map(c => c.db(dbName).collection(COMPACTION_LEASE_COLLECTION));
  let claimed = 0;
  for (let cycle = 0; cycle < 6; cycle++) {
    const source = "source-" + cycle;
    const results = await Promise.all(Array.from({ length: 50 }, (_, i) =>
      claimCompaction(coll[i % coll.length], scope, source)));
    const wins = results.filter(Boolean);
    assert.equal(wins.length, 1, "Exactly one auto-compact winner for each 50-way race");
    claimed += wins.length;
    const winner = wins[0];
    assert.equal(await finishCompaction(coll[0], winner, "dify-" + cycle), true);
    assert.equal(await finishCompaction(coll[1], winner, "stale"), false);
    assert.equal((await claimCompaction(coll[2], scope, source)), null,
      "Same source cannot be compacted again");
  }
  assert.equal(claimed, 6);
  cases.push("6 rounds x 50 contending calls: exactly one winner per source");

  const revoked = await claimCompaction(coll[0], scope, "source-stop");
  assert.ok(revoked);
  assert.equal(await stopCompaction(coll[1], scope), true);
  assert.equal(await finishCompaction(coll[2], revoked, "should-not-publish"), false);
  assert.equal(await releaseCompaction(coll[3], revoked), false);
  const recovered = await claimCompaction(coll[4], scope, "source-retry");
  assert.ok(recovered && recovered.epoch > revoked.epoch);
  assert.equal(await releaseCompaction(coll[1], recovered), true);
  cases.push("Stop fences in-flight compaction token; stale completion rejected");

  const otherScope = { ...scope, conversationId: "chat-other" };
  const otherOwner = { ...scope, ownerEmail: "bob@example.test" };
  const other = await Promise.all([claimCompaction(coll[0], otherScope, "source-stop"),
    claimCompaction(coll[1], otherOwner, "source-stop")]);
  assert.equal(other.filter(Boolean).length, 2);
  await Promise.all(other.map((claim, i) => releaseCompaction(coll[i], claim)));
  cases.push("separate chats and users cannot interfere with each other's locks");

  const checkpoints = clients.map(c => c.db(dbName).collection(CHECKPOINT_COLLECTION));
  const checkpointScope = { projectId: scope.projectId, chatId: scope.conversationId };
  await Promise.all(Array.from({ length: 200 }, (_, i) =>
    appendSharedCheckpoint(checkpoints[i % 5], checkpointScope, {
      taskId: "task-a", step: i, action: "tool", failed: false, observation: "verified-" + i,
    })));
  const restored = await listSharedCheckpoints(checkpoints[0], checkpointScope);
  assert.equal(restored.length, 16);
  assert.equal(new Set(restored.map(x => x.step)).size, 16);
  assert.equal((await listSharedCheckpoints(checkpoints[1], {
    projectId: "another-project", chatId: scope.conversationId })).length, 0);
  cases.push("200 concurrent cross-client checkpoint writes preserve bounded, isolated state");
  console.log(JSON.stringify({ l7: "PASS", clients: clients.length, contenders: 50,
    rounds: 6, compactWinners: claimed, concurrentCheckpointWrites: 200,
    staleCommits: 0, cases, realMongo: true }, null, 2));
} finally {
  try {
    if (created) {
      const marker = await db.collection("l7_run").findOne({ _id: "marker" });
      if (marker?.runId !== runId || marker.purpose !== "l7_memory_race")
        throw Error("Marker changed; refusing cleanup");
      await db.dropDatabase();
    }
  } finally { await Promise.all(clients.map(c => c.close())); }
}
