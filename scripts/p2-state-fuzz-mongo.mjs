import assert from "node:assert/strict";
import { isolatedDb, newId } from "./p2-qa-db.mjs";
import { claimBrowserLease, assertBrowserLease, renewBrowserLease,
  changeBrowserControl, stopBrowserLease, finishBrowserLease,
  quarantineExpiredBrowser, acknowledgeBrowserRecovery } from
  "../lib/project-agent/runtime/browser-agent/g2-lease-core.mjs";

const steps = 10_000, slotsCount = 16;
const seedInput = Number(process.env.P2_FUZZ_SEED || 20261027);
assert.ok(Number.isSafeInteger(seedInput) && seedInput > 0 && seedInput < 2 ** 32);
let seed = seedInput >>> 0;
function rand() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return seed >>> 0;
}
const owner = n => "p2-owner-" + (n % 4) + "@project-agent.test";
const slots = Array.from({ length: slotsCount }, (_, i) => ({
  id: "pat_" + newId(), owner: owner(i), claim: null, previousEpoch: 0,
}));
const summary = { steps, seed: seedInput, successfulClaims: 0,
  handoffs: 0, rejectedStaleClaims: 0, stops: 0, quarantines: 0,
  explicitReviews: 0, terminalCases: 0, wrongOwnerAccepted: 0 };
const elapsedStart = Date.now();
await isolatedDb(27019, "fuzz", async ({ db }) => {
  const coll = db.collection("projectAgentBrowserOwnership");
  for (let step = 0; step < steps; step++) {
    const i = rand() % slotsCount, op = rand() % 11;
    const s = slots[i];
    try {
      const row = await coll.findOne({ _id: s.id });
      if (!row || row.state === "vacant") {
        const next = await claimBrowserLease(coll, s.id, s.owner, "worker-" + i);
        assert.ok(next && next.epoch > s.previousEpoch);
        s.claim = next; s.previousEpoch = next.epoch;
        summary.successfulClaims++;
      } else if (["agent", "human"].includes(row.state)) {
        assert.ok(s.claim && row.leaseToken === s.claim.token);
        if (op < 3) {
          const stale = { ...s.claim };
          const to = row.state === "agent" ? "human" : "agent";
          const revision = await changeBrowserControl(coll, s.claim, row.state, to);
          assert.equal(revision, stale.revision + 1);
          await assert.rejects(assertBrowserLease(coll, stale, row.state), /lost/);
          summary.handoffs++; summary.rejectedStaleClaims++;
        } else if (op === 3) {
          assert.equal(await renewBrowserLease(coll, s.claim), true);
          assert.ok(await assertBrowserLease(coll, s.claim, row.state));
        } else if (op === 4) {
          assert.equal(await claimBrowserLease(coll, s.id, s.owner, "intruder"), null);
        } else if (op === 5) {
          assert.equal(await stopBrowserLease(coll, s.id, s.owner), true);
          await assert.rejects(assertBrowserLease(coll, s.claim, row.state), /lost/);
          summary.stops++; summary.rejectedStaleClaims++;
        } else if (op === 6) {
          assert.equal(await finishBrowserLease(coll, s.claim), true);
          await assert.rejects(assertBrowserLease(coll, s.claim, row.state), /lost/);
          summary.terminalCases++; summary.rejectedStaleClaims++;
        } else if (op === 7) {
          await coll.updateOne({ _id: s.id, state: row.state },
            { $set: { leaseUntil: "2000-01-01T00:00:00.000Z" } });
          await assert.rejects(assertBrowserLease(coll, s.claim, row.state), /lost/);
          assert.equal(await quarantineExpiredBrowser(coll, s.id), true);
          summary.quarantines++; summary.rejectedStaleClaims++;
        } else if (op === 8) {
          assert.equal(await stopBrowserLease(coll, s.id, "foreign@project-agent.test"), false);
          assert.equal(await claimBrowserLease(coll, s.id, "foreign@project-agent.test", "bad"), null);
        } else if (op === 9) {
          await assert.rejects(changeBrowserControl(coll, s.claim, row.state, row.state),
            /Invalid browser control transition/);
        } else {
          assert.ok(await assertBrowserLease(coll, s.claim, row.state));
        }
      } else if (row.state === "quarantined") {
        if (op < 6) {
          await assert.rejects(acknowledgeBrowserRecovery(coll, s.id, s.owner, false), /review/);
          assert.equal(await acknowledgeBrowserRecovery(coll, s.id, "foreign@project-agent.test", true), false);
          assert.equal(await acknowledgeBrowserRecovery(coll, s.id, s.owner, true), true);
          summary.explicitReviews++;
        } else {
          assert.equal(await claimBrowserLease(coll, s.id, s.owner, "unreviewed"), null);
          assert.equal(await stopBrowserLease(coll, s.id, "foreign@project-agent.test"), false);
        }
      } else {
        assert.ok(["stopped", "closed"].includes(row.state));
        assert.equal(await claimBrowserLease(coll, s.id, s.owner, "late"), null);
        if (s.claim) {
          await assert.rejects(assertBrowserLease(coll, s.claim), /lost/);
          summary.rejectedStaleClaims++;
        }
        slots[i] = { id: "pat_" + newId(), owner: s.owner, claim: null, previousEpoch: 0 };
      }
      if (step % 100 === 0) {
        const check = await coll.findOne({ _id: s.id });
        assert.equal(check?.ownerEmail, s.owner);
        if (["stopped", "closed", "quarantined"].includes(check.state)) {
          assert.equal(check.leaseToken, undefined);
          assert.equal(check.leaseUntil, undefined);
        }
      }
    } catch (error) {
      throw Error("P2 FUZZ FAIL seed=" + seedInput + " step=" + step +
        " slot=" + i + " op=" + op + " state=" + (await coll.findOne({ _id: s.id }))?.state,
        { cause: error });
    }
  }
});
console.log(JSON.stringify({ p2StateFuzz: "PASS", ...summary,
  elapsedMs: Date.now() - elapsedStart, externalCalls: false }, null, 2));
