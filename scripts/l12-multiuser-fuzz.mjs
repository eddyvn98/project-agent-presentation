import assert from "node:assert/strict";
import { isolatedMemoryQa } from "./l11-qa-db.mjs";
import { appendSharedCheckpoint, listSharedCheckpoints,
  CHECKPOINT_COLLECTION } from "../lib/project-agent/runtime/checkpoint-core.mjs";
import { claimCompaction, finishCompaction,
  COMPACTION_LEASE_COLLECTION } from "../lib/project-agent/compact-lease-core.mjs";
await isolatedMemoryQa("l12", async ({ db }) => {
  const data = db.collection(CHECKPOINT_COLLECTION),
    locks = db.collection(COMPACTION_LEASE_COLLECTION);
  const users = Array.from({ length: 20 }, (_, i) => ({
    projectId: "qa-project-" + (i % 5), ownerEmail: "user" + i + "@project-agent.test",
    chatId: "user-chat-" + i,
  }));
  let seed = 20261027;
  const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return seed >>> 0; };
  const rounds = 40, failures = [];
  for (let round = 0; round < rounds; round++) {
    await Promise.all(users.map(async (user, index) => {
      const number = round * 20 + index;
      const item = { taskId: "pat_" + number.toString(16).padStart(12, "0"),
        step: round, action: "test", failed: false,
        observation: "owner=" + user.ownerEmail };
      await appendSharedCheckpoint(data, user, item);
      if (round % 5 === 0) {
        const own = await listSharedCheckpoints(data, user);
        if (own.some(x => x.observation !== "owner=" + user.ownerEmail))
          failures.push("cross-user checkpoint");
      }
      if (round % 4 === 0) {
        const scope = { projectId: user.projectId, ownerEmail: user.ownerEmail,
          conversationId: user.chatId };
        const grant = await claimCompaction(locks, scope, item.taskId);
        if (!grant || !await finishCompaction(locks, grant, "dify-" + number))
          failures.push("lost or wrongly shared compaction claim");
      }
      if (round % 7 === 0) {
        const other = users[(index + 1 + rand() % 19) % 20];
        if ((await listSharedCheckpoints(data, {
          projectId: other.projectId, chatId: user.chatId })).length)
          failures.push("cross-project read");
        if ((await listSharedCheckpoints(data, {
          projectId: user.projectId, chatId: other.chatId })).length)
          failures.push("cross-conversation read");
      }
    }));
  }
  assert.deepEqual(failures, []);
  for (const user of users) {
    const entries = await listSharedCheckpoints(data, user);
    assert.equal(entries.length, 16);
    assert.equal(entries.at(-1).observation, "owner=" + user.ownerEmail);
  }
  assert.equal(await locks.countDocuments({ state: "active" }), 0);
  console.log(JSON.stringify({ l12: "PASS", owners: users.length, projects: 5,
    operations: users.length * rounds, crossScopeLeaks: failures.length,
    activeLeases: 0, realMongo: true, membershipProvider: "NOT RUN",
    liveUsers: false }, null, 2));
});
