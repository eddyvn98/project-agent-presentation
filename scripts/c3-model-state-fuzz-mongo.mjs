import assert from "node:assert/strict";
import { isolatedDb } from "./p2-qa-db.mjs";
import { claimBrowserLease, assertBrowserLease, renewBrowserLease,
  changeBrowserControl, stopBrowserLease, finishBrowserLease,
  quarantineExpiredBrowser, acknowledgeBrowserRecovery } from
  "../lib/project-agent/runtime/browser-agent/g2-lease-core.mjs";

const runs = [20261027, 84591, 7351337], length = 8000, slotCount = 12;
const results = [];
for (const sourceSeed of runs) {
  const result = await isolatedDb(27019, "fuzz", async ({ db }) => {
    const coll = db.collection("projectAgentBrowserOwnership");
    let seed = sourceSeed >>> 0, serial = 1;
    const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
    const nextId = () => "pat_" + (serial++).toString(16).padStart(12, "0");
    const slots = Array.from({ length: slotCount }, (_, index) => ({
      id: nextId(), owner: "qa-user-" + index + "@project-agent.test",
      state: "unallocated", epoch: 0, revision: 0, claim: null,
    }));
    const counters = { seed: sourceSeed, steps: length, handoffs: 0,
      stops: 0, closes: 0, expiries: 0, reviewed: 0, staleRejected: 0,
      foreignOwnerDenied: 0, claims: 0 };
    for (let step = 0; step < length; step++) {
      const slotIndex = rand() % slotCount, op = rand() % 12;
      const slot = slots[slotIndex];
      try {
        const before = { state: slot.state, epoch: slot.epoch,
          revision: slot.revision };
        if (slot.state === "unallocated" || slot.state === "vacant") {
          const claim = await claimBrowserLease(coll, slot.id, slot.owner, "worker-" + slotIndex);
          assert.ok(claim, "A reviewed or fresh slot must be claimable");
          slot.claim = claim;
          slot.epoch++; slot.revision++; slot.state = "agent";
          assert.equal(claim.epoch, slot.epoch);
          assert.equal(claim.revision, slot.revision);
          counters.claims++;
        } else if (slot.state === "agent" || slot.state === "human") {
          if (op <= 2) {
            const old = { ...slot.claim };
            const next = slot.state === "agent" ? "human" : "agent";
            assert.equal(await changeBrowserControl(coll, slot.claim, slot.state, next),
              slot.revision + 1);
            slot.state = next; slot.revision++;
            await assert.rejects(assertBrowserLease(coll, old, before.state), /lost/);
            counters.staleRejected++; counters.handoffs++;
          } else if (op === 3) {
            assert.equal(await renewBrowserLease(coll, slot.claim), true);
            assert.equal(await assertBrowserLease(coll, slot.claim, slot.state), slot.revision);
          } else if (op === 4) {
            assert.equal(await stopBrowserLease(coll, slot.id,
              "attacker@project-agent.test"), false);
            assert.equal(await claimBrowserLease(coll, slot.id,
              "attacker@project-agent.test", "foreign-worker"), null);
            counters.foreignOwnerDenied++;
          } else if (op === 5) {
            assert.equal(await stopBrowserLease(coll, slot.id, slot.owner), true);
            slot.state = "stopped"; slot.revision++; counters.stops++;
            await assert.rejects(assertBrowserLease(coll, slot.claim, before.state), /lost/);
            counters.staleRejected++;
          } else if (op === 6) {
            assert.equal(await finishBrowserLease(coll, slot.claim), true);
            slot.state = "closed"; slot.revision++; counters.closes++;
            await assert.rejects(assertBrowserLease(coll, slot.claim, before.state), /lost/);
            counters.staleRejected++;
          } else if (op === 7 || op === 8) {
            await coll.updateOne({ _id: slot.id }, {
              $set: { leaseUntil: "2000-01-01T00:00:00.000Z" } });
            assert.equal(await quarantineExpiredBrowser(coll, slot.id), true);
            slot.state = "quarantined"; slot.revision++; counters.expiries++;
            await assert.rejects(assertBrowserLease(coll, slot.claim, before.state), /lost/);
            counters.staleRejected++;
          } else if (op === 9) {
            const stolen = { ...slot.claim, token: "forged" };
            await assert.rejects(assertBrowserLease(coll, stolen, slot.state), /lost/);
            counters.staleRejected++;
          } else if (op === 10) {
            assert.equal(await claimBrowserLease(coll, slot.id, slot.owner, "second-worker"), null);
          } else {
            await assert.rejects(changeBrowserControl(coll, slot.claim,
              slot.state, slot.state), /Invalid browser control transition/);
          }
        } else if (slot.state === "quarantined") {
          if (op <= 7) {
            await assert.rejects(acknowledgeBrowserRecovery(coll, slot.id,
              slot.owner, false), /review/);
            assert.equal(await acknowledgeBrowserRecovery(coll, slot.id,
              "attacker@project-agent.test", true), false);
            assert.equal(await acknowledgeBrowserRecovery(coll, slot.id,
              slot.owner, true), true);
            slot.state = "vacant"; slot.revision++; counters.reviewed++;
          } else {
            assert.equal(await claimBrowserLease(coll, slot.id, slot.owner, "unsafe"), null);
            assert.equal(await stopBrowserLease(coll, slot.id,
              "attacker@project-agent.test"), false);
          }
        } else {
          assert.ok(["closed", "stopped"].includes(slot.state));
          assert.equal(await claimBrowserLease(coll, slot.id, slot.owner, "late"), null);
          const fresh = nextId();
          slots[slotIndex] = { id: fresh, owner: slot.owner,
            state: "unallocated", epoch: 0, revision: 0, claim: null };
          continue;
        }
        const stored = await coll.findOne({ _id: slot.id });
        assert.equal(stored.state, slot.state, "Real Mongo state diverged from reference");
        assert.equal(stored.epoch, slot.epoch, "Wrong epoch");
        assert.equal(stored.revision, slot.revision, "Wrong revision");
        assert.equal(stored.ownerEmail, slot.owner);
        if (["agent", "human"].includes(slot.state)) {
          assert.equal(stored.leaseToken, slot.claim.token);
          assert.equal(await assertBrowserLease(coll, slot.claim, slot.state), slot.revision);
        } else {
          assert.equal(stored.leaseToken, undefined);
          assert.equal(stored.leaseUntil, undefined);
        }
      } catch (error) {
        throw new Error("C3 MODEL DIVERGENCE seed=" + sourceSeed +
          " step=" + step + " slot=" + slotIndex + " op=" + op +
          " expected=" + slot.state, { cause: error });
      }
    }
    return counters;
  });
  results.push(result);
}
console.log(JSON.stringify({ c3: "PASS", steps: runs.length * length,
  distinctSeeds: runs, runs: results, realMongo: true,
  referenceModel: "independent state, epoch and revision invariants",
  externalEffects: false }, null, 2));
