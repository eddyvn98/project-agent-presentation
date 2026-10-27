import assert from "node:assert/strict";
import { request } from "@playwright/test";
import { startCrashHosts, killCrashHost, stopCrashHost } from "./g2-crash-hosts.mjs";
import { verifySyntheticNextAuthState } from "./p7-session-preflight.mjs";

const e = process.env;
if (e.PROJECT_AGENT_L3C_QA_CHECKPOINT !== "1" ||
    e.PROJECT_AGENT_CONTEXT_CHECKPOINT_BACKEND !== "mongo" ||
    e.PROJECT_AGENT_HINDSIGHT_API_URL ||
    e.L3C_L8B_QA_CONFIRM !== "isolated-synthetic-only")
  throw Error("L3C/L8B requires isolated Mongo, no remote Hindsight, explicit opt-in");
const root = "/api/projects/" + encodeURIComponent(e.P7_PROJECT_ID ?? "") + "/agent";
const checkpoint = root + "/l3c-checkpoint", fixture = root + "/p7-qa";
const tasks = root + "/tasks", chats = root + "/chats";
const check = async (response, expected) => {
  const value = await response.text();
  assert.equal(response.status(), expected, value.slice(0, 330));
  return JSON.parse(value);
};
async function ready(host) {
  const started = Date.now();
  while (Date.now() - started < 120000) {
    if (host.child.exitCode !== null || host.child.signalCode !== null)
      throw Error("QA host exited: " + host.getLog().slice(-1000));
    try {
      const ctx = await request.newContext({ baseURL: host.origin });
      const response = await ctx.get("/api/auth/session", { timeout: 1500, failOnStatusCode: false });
      await ctx.dispose();
      if (response.status() === 200) return;
    } catch { /* wait for Next dev compile */ }
    await new Promise(done => setTimeout(done, 800));
  }
  throw Error("Next readiness timeout");
}
let hosts = [], ownerA, ownerB, outsider, activeTask, cleanupError;
const cases = [];
try {
  hosts = await startCrashHosts(e);
  assert.notEqual(hosts[0].child.pid, hosts[1].child.pid);
  await Promise.all(hosts.map(ready));
  const [a, b] = hosts.map(x => x.origin);
  for (const origin of [a, b])
    for (const [state, email] of [[e.P7_OWNER_STORAGE_STATE, e.P7_OWNER_EMAIL],
      [e.P7_NONMEMBER_STORAGE_STATE, e.P7_OTHER_EMAIL]])
      assert.equal(await verifySyntheticNextAuthState(origin, state, email, request),
        email.toLowerCase());
  ownerA = await request.newContext({ baseURL: a, storageState: e.P7_OWNER_STORAGE_STATE });
  ownerB = await request.newContext({ baseURL: b, storageState: e.P7_OWNER_STORAGE_STATE });
  outsider = await request.newContext({ baseURL: b, storageState: e.P7_NONMEMBER_STORAGE_STATE });
  const post = (ctx, origin, path, data) => ctx.post(path, {
    data, headers: { Origin: origin }, failOnStatusCode: false });
  const remove = (ctx, origin, path) => ctx.delete(path, {
    headers: { Origin: origin }, failOnStatusCode: false });

  await check(await post(ownerA, a, checkpoint, { step: 1 }), 200);
  assert.equal((await check(await ownerB.get(checkpoint), 200)).recovered, true);
  assert.equal((await outsider.get(checkpoint, { failOnStatusCode: false })).status(), 404);
  cases.push("Next A writes checkpoint; B reads; nonmember rejected");
  await killCrashHost(hosts[0]);
  assert.ok(hosts[0].child.exitCode !== null || hosts[0].child.signalCode !== null);
  assert.ok((await check(await ownerB.get(checkpoint), 200)).checkpoint.includes("verified QA step 1"));
  await check(await post(ownerB, b, checkpoint, { step: 2 }), 200);
  assert.ok((await check(await ownerB.get(checkpoint), 200)).checkpoint.includes("verified QA step 2"));
  cases.push("SIGKILL host A; host B resumes persisted checkpoint");

  activeTask = (await check(await post(ownerB, b, fixture, { kind: "p8_browser" }), 201)).taskId;
  assert.match(activeTask, /^pat_[a-f0-9]{12}$/);
  await check(await remove(ownerB, b, chats + "?taskId=" + activeTask), 409);
  const denied = await remove(outsider, b, chats + "?taskId=" + activeTask);
  assert.ok([401, 403, 404].includes(denied.status()));
  cases.push("Cannot delete running synthetic task; nonmember cannot delete");

  await check(await post(ownerB, b, tasks + "/" + activeTask + "/stop", {}), 200);
  await check(await remove(ownerB, b, chats + "?taskId=" + activeTask), 200);
  assert.equal((await ownerB.get(tasks + "/" + activeTask, { failOnStatusCode: false })).status(), 404);
  activeTask = undefined;
  cases.push("Stop then delete removes chat and task across real Next host");

  await check(await remove(ownerB, b, checkpoint), 200);
  assert.equal((await check(await ownerB.get(checkpoint), 200)).recovered, false);
  cases.push("Deleted Mongo checkpoint cannot be recalled");
  console.log(JSON.stringify({ l3cL8b: "PASS", nextProcesses: 2,
    realMongo: true, realModel: false, realIdentityProvider: false,
    syntheticOnly: true, cases }, null, 2));
} finally {
  if (ownerB && activeTask && hosts[1]) {
    try {
      const response = await ownerB.delete(fixture, {
        headers: { Origin: hosts[1].origin }, data: { taskId: activeTask },
        failOnStatusCode: false });
      if (!response.ok()) cleanupError = "QA task cleanup failed: " + response.status();
    } catch (error) { cleanupError = String(error); }
  }
  for (const ctx of [ownerA, ownerB, outsider]) await ctx?.dispose().catch(() => {});
  for (const host of hosts.reverse())
    await stopCrashHost(host).catch(async () => killCrashHost(host).catch(() => {}));
  if (cleanupError) throw Error(cleanupError);
}
