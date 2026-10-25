import assert from "node:assert/strict";
import { test } from "node:test";
import {
  claimBrowserLease, assertBrowserLease, renewBrowserLease,
  changeBrowserControl, finishBrowserLease, stopBrowserLease,
  quarantineExpiredBrowser, acknowledgeBrowserRecovery,
} from "../../lib/project-agent/runtime/browser-agent/g2-lease-core.mjs";

const taskId = "pat_123456789abc", owner = "owner@project-agent.test";
function fakeMongo() {
  const rows = new Map();
  const same = (value, wanted) => wanted && typeof wanted === "object"
    ? Object.entries(wanted).every(([k, v]) => k === "$in" ? v.includes(value)
      : k === "$gt" ? value > v : k === "$lt" ? value < v : value === v)
    : value === wanted;
  const matches = (row, filter) => Object.entries(filter)
    .every(([key, value]) => same(row[key], value));
  const apply = (row, patch) => {
    Object.assign(row, patch.$set ?? {});
    for (const key of Object.keys(patch.$unset ?? {})) delete row[key];
    for (const [key, value] of Object.entries(patch.$inc ?? {}))
      row[key] = (row[key] ?? 0) + value;
    return row;
  };
  const updateOne = async (filter, patch, options) => {
    let row = [...rows.values()].find(item => matches(item, filter));
    if (!row && options?.upsert) {
      if (rows.has(filter._id)) throw Error("E11000 duplicate key");
      row = { ...patch.$setOnInsert };
      rows.set(filter._id, row);
      return { matchedCount: 0, modifiedCount: 0 };
    }
    if (!row) return { matchedCount: 0, modifiedCount: 0 };
    apply(row, patch);
    return { matchedCount: 1, modifiedCount: 1 };
  };
  return {
    rows, updateOne,
    findOne: async (filter) => {
      const row = [...rows.values()].find(item => matches(item, filter));
      return row ? { ...row } : null;
    },
    findOneAndUpdate: async (filter, patch) => {
      const row = [...rows.values()].find(item => matches(item, filter));
      return row ? { ...apply(row, patch) } : null;
    },
  };
}
const claim = (db, worker, now = 1000) =>
  claimBrowserLease(db, taskId, owner, worker, now);

test("two competing workers: only one browser lease and fenced action", async () => {
  const db = fakeMongo();
  const [a, b] = await Promise.all([claim(db, "worker-a"), claim(db, "worker-b")]);
  assert.equal([a, b].filter(Boolean).length, 1);
  const winner = a ?? b;
  assert.ok(await assertBrowserLease(db, winner, "agent", 2000));
  assert.equal(await claim(db, "third-worker"), null);
  assert.equal(await renewBrowserLease(db, winner, 2000), true);
  assert.equal(await finishBrowserLease(db, winner), true);
  await assert.rejects(assertBrowserLease(db, winner, "agent", 2000), /lost/);
});
test("human owns paused browser; stale revision and remote takeover fail closed", async () => {
  const db = fakeMongo(), owned = await claim(db, "owner-process");
  assert.ok(owned);
  const stale = { ...owned };
  const revision = await changeBrowserControl(db, owned, "agent", "human", 2000);
  assert.ok(revision > stale.revision);
  await assert.rejects(assertBrowserLease(db, stale, "agent", 2000), /lost/);
  assert.ok(await assertBrowserLease(db, owned, "human", 2000));
  assert.equal(await claim(db, "another-process"), null);
  const next = await changeBrowserControl(db, owned, "human", "agent", 2000);
  assert.ok(next > revision);
  await assert.rejects(assertBrowserLease(db, stale, "agent", 2000), /lost/);
  assert.ok(await assertBrowserLease(db, owned, "agent", 2000));
});
test("Stop invalidates both agent and human operations, without replay", async () => {
  const db = fakeMongo(), owned = await claim(db, "worker-a");
  assert.ok(owned);
  await changeBrowserControl(db, owned, "agent", "human", 2000);
  assert.equal(await stopBrowserLease(db, taskId, owner), true);
  await assert.rejects(assertBrowserLease(db, owned, "human", 2000), /lost/);
  await assert.rejects(assertBrowserLease(db, owned, "agent", 2000), /lost/);
  assert.equal(await claim(db, "worker-b"), null);
  assert.equal(await finishBrowserLease(db, owned), false);
});
test("crash expiry quarantines; explicit reviewed restart gets a higher epoch", async () => {
  const db = fakeMongo(), old = await claim(db, "dead-worker");
  assert.ok(old);
  assert.equal(await quarantineExpiredBrowser(db, taskId, 2000), false);
  assert.equal(await quarantineExpiredBrowser(db, taskId, 130_000), true);
  assert.equal(await claim(db, "replacement"), null);
  await assert.rejects(assertBrowserLease(db, old, "agent", 130_000), /lost/);
  await assert.rejects(acknowledgeBrowserRecovery(db, taskId, owner, false), /review/);
  assert.equal(await acknowledgeBrowserRecovery(db, taskId, owner, true), true);
  const fresh = await claim(db, "replacement", 130_001);
  assert.ok(fresh);
  assert.equal(fresh.epoch, old.epoch + 1);
  assert.notEqual(fresh.token, old.token);
  await assert.rejects(assertBrowserLease(db, old, "agent", 130_002), /lost/);
  assert.ok(await assertBrowserLease(db, fresh, "agent", 130_002));
});
