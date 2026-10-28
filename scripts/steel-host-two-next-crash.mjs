import assert from "node:assert/strict";
import { request } from "@playwright/test";
import { steelQaLiveGate } from "./steel-host-qa-guard.mjs";
import { startCrashHosts, killCrashHost, stopCrashHost,
  crashEnvironment } from "./g2-crash-hosts.mjs";
import { verifySyntheticNextAuthState } from "./p7-session-preflight.mjs";

const env = process.env;
const path = () => "/api/projects/" + encodeURIComponent(env.P7_PROJECT_ID) + "/agent/browser";
const post = (ctx, origin, data) => ctx.post(path(), {
  headers: { Origin: origin }, data, timeout: 55000, failOnStatusCode: false,
});
const take = async (response, status) => {
  const body = await response.text();
  assert.equal(response.status(), status, body.slice(0, 180));
  return JSON.parse(body);
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready(origin, host) {
  const started = Date.now();
  while (Date.now() - started < 150000) {
    if (host.child.exitCode !== null || host.child.signalCode !== null)
      throw Error("Isolated Next worker terminated during readiness");
    let ctx;
    try {
      ctx = await request.newContext({ baseURL: origin });
      const response = await ctx.get("/api/auth/session",
        { timeout: 1600, failOnStatusCode: false });
      if (response.status() === 200) return;
    } catch { /* QA Next worker compiling */ }
    finally { await ctx?.dispose().catch(() => {}); }
    await sleep(900);
  }
  throw Error("QA Next worker health check timed out");
}
async function authenticatedAtBoth(origins) {
  const ownerState = env.P7_OWNER_STORAGE_STATE;
  const otherState = env.P7_NONMEMBER_STORAGE_STATE;
  for (const origin of origins) {
    const owner = await verifySyntheticNextAuthState(origin,
      ownerState, env.P7_OWNER_EMAIL, request);
    const other = await verifySyntheticNextAuthState(origin,
      otherState, env.P7_OTHER_EMAIL, request);
    assert.notEqual(owner, other, "QA accounts must be isolated");
  }
}
async function main() {
  // Preflight MUST precede process creation and any Steel API request.
  const gate = steelQaLiveGate(env);
  crashEnvironment(env); // Exact run markers, separate checkouts/builds, QA DB attestation.
  let hosts = [], a, b, outsider, opened = false, cleaned = false;
  let error;
  let proof;
  try {
    hosts = await startCrashHosts(env, { disableG2Ownership: true });
    assert.notEqual(hosts[0].child.pid, hosts[1].child.pid);
    const [originA, originB] = hosts.map(host => host.origin);
    await Promise.all(hosts.map(host => ready(host.origin, host)));
    await authenticatedAtBoth([originA, originB]);
    a = await request.newContext({ baseURL: originA,
      storageState: env.P7_OWNER_STORAGE_STATE });
    b = await request.newContext({ baseURL: originB,
      storageState: env.P7_OWNER_STORAGE_STATE });
    outsider = await request.newContext({ baseURL: originB,
      storageState: env.P7_NONMEMBER_STORAGE_STATE });
    // A timed-out start may still have created a Steel session: attempt cleanup.
    opened = true;
    const first = await take(await post(a, originA, { op: "start" }), 200);
    assert.equal(first.connected, true);
    assert.equal(first.viewerUrl, null, "Steel player must not be exposed by QA");
    assert.match(first.qaSessionProof ?? "", /^[a-f0-9]{24}$/,
      "No attested shared Steel QA session proof");
    const second = await take(await post(b, originB, { op: "start" }), 200);
    assert.equal(second.connected, true);
    assert.equal(second.qaSessionProof, first.qaSessionProof,
      "Workers A/B must attach to the same Steel session identity");
    assert.equal(second.tabs.length, first.tabs.length, "Second worker duplicated browser tabs");
    const initial = first.tabs.length;
    assert.ok(initial > 0 && initial <= 7);
    const forbidden = await outsider.get(path(), { failOnStatusCode: false });
    assert.ok([401, 403, 404].includes(forbidden.status()),
      "Nonmember must not read shared browser");
    await take(await post(a, originA, { op: "takeover" }), 200);
    const added = await take(await post(a, originA, { op: "new_tab" }), 200);
    assert.equal(added.qaSessionProof, first.qaSessionProof);
    assert.equal(added.tabs.length, initial + 1);
    await take(await post(a, originA, { op: "release" }), 200);
    const fromB = await take(await b.get(path(), { failOnStatusCode: false }), 200);
    assert.equal(fromB.connected, true);
    assert.equal(fromB.qaSessionProof, first.qaSessionProof);
    assert.equal(fromB.tabs.length, initial + 1,
      "Worker B did not attach to A's same remote browser");
    const countBeforeCrash = fromB.tabs.length;
    await killCrashHost(hosts[0]); // Kill only the launcher group owned by this harness.
    assert.ok(hosts[0].child.exitCode !== null || hosts[0].child.signalCode !== null);
    const recovered = await take(await b.get(path(), { failOnStatusCode: false }), 200);
    assert.equal(recovered.connected, true, "Worker B could not reattach after A SIGKILL");
    assert.equal(recovered.qaSessionProof, first.qaSessionProof,
      "Worker B silently switched to a different Steel session after A SIGKILL");
    assert.equal(recovered.tabs.length, countBeforeCrash,
      "A previously committed browser action was unexpectedly replayed");
    const denied = await post(outsider, originB, { op: "takeover" });
    assert.ok([401, 403, 404].includes(denied.status()));
    await take(await post(b, originB, { op: "takeover" }), 200);
    const deliberate = await take(await post(b, originB, { op: "new_tab" }), 200);
    assert.equal(deliberate.qaSessionProof, first.qaSessionProof);
    assert.equal(deliberate.tabs.length, countBeforeCrash + 1,
      "Exactly one new tab must appear after explicit B action");
    await take(await post(b, originB, { op: "release" }), 200);
    proof = { steelLiveQa: "PASS", nextWorkers: 2,
      launcherPids: hosts.map(host => host.child.pid), actualSteelService: true,
      sharedSessionObserved: true, sameSteelIdentityBeforeAfterCrash: true,
      priorTabs: initial,
      tabsBeforeCrash: countBeforeCrash, tabsAfterCrash: recovered.tabs.length,
      tabsAfterExplicitAction: deliberate.tabs.length,
      noAutomaticReplay: true, nonmemberDenied: true,
      externalWebsiteMutation: false, steelApiOrigin: gate.apiOrigin };
  } catch (caught) { error = caught; }
  finally {
    if (opened) {
      const candidates = [[b, hosts[1]], [a, hosts[0]]];
      const failures = [];
      for (const [ctx, host] of candidates) {
        if (!ctx || !host ||
            host.child.exitCode !== null || host.child.signalCode !== null) continue;
        try {
          const closed = await ctx.delete(path(), {
            headers: { Origin: host.origin }, timeout: 30000,
            failOnStatusCode: false,
          });
          await take(closed, 200);
          const state = await take(await ctx.get(path(),
            { failOnStatusCode: false }), 200);
          assert.equal(state.connected, false);
          cleaned = true;
          break;
        } catch (failure) { failures.push(failure); }
      }
      if (!cleaned) error = new AggregateError([error, ...failures].filter(Boolean),
        "Steel QA cleanup failed; inspect the isolated Steel account manually");
    }
    for (const ctx of [outsider, a, b]) await ctx?.dispose().catch(() => {});
    for (const host of hosts.reverse())
      await stopCrashHost(host).catch(() => {});
  }
  if (error) throw error;
  assert.equal(cleaned, true, "Shared Steel QA session was not explicitly released");
  console.log(JSON.stringify({ ...proof, remoteCleanup: "confirmed" }, null, 2));
}
main().catch(error => {
  console.error("Steel two-Next real-host QA FAIL:", error.message);
  process.exitCode = 1;
});
