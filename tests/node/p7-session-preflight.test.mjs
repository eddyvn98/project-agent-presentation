import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syntheticSessionEmail, isolatedQaOrigin,
  p7SessionPreflight } from "../../scripts/p7-session-preflight.mjs";

test("empty, non-synthetic, or wrong-user NextAuth sessions cannot pass", () => {
  const owner = "owner@project-agent.test";
  for (const session of [null, {}, { user: {} }, { user: { email: "employee@example.com" } },
    { user: { email: "other@project-agent.test" } }]) {
    assert.throws(() => syntheticSessionEmail(session, owner), /NextAuth/);
  }
  assert.equal(syntheticSessionEmail({ user: { email: "OWNER@PROJECT-AGENT.TEST" } }, owner), owner);
});
test("session check never treats a shared or remote URL as an isolated mutation target", () => {
  assert.equal(isolatedQaOrigin("http://127.0.0.1:3005/"), "http://127.0.0.1:3005");
  assert.throws(() => isolatedQaOrigin("https://example.com"), /loopback/);
  assert.throws(() => isolatedQaOrigin("http://user:secret@127.0.0.1:3005"), /loopback/);
  assert.throws(() => isolatedQaOrigin("http://127.0.0.1:3004/", true,
    "http://127.0.0.1:3005"), /MUTATION_ALLOWED_ORIGIN/);
  assert.equal(isolatedQaOrigin("http://127.0.0.1:3005/", true,
    "http://127.0.0.1:3005"), "http://127.0.0.1:3005");
});
test("does not make any request without isolated QA opt-in", async () => {
  await assert.rejects(p7SessionPreflight({ P7_HOST_BASE_URL: "http://127.0.0.1:3005" },
    { newContext: () => { throw new Error("should not connect"); } }), /P7_ISOLATED_QA/);
});
test("checks live owner and nonmember NextAuth session before reporting readiness", async () => {
  const folder = mkdtempSync(join(tmpdir(), "p7-sessions-"));
  const ownerState = join(folder, "owner.json"), otherState = join(folder, "other.json");
  writeFileSync(ownerState, JSON.stringify({ cookies: [], origins: [] }));
  writeFileSync(otherState, JSON.stringify({ cookies: [], origins: [] }));
  const env = {
    P7_ISOLATED_QA: "1", P7_HOST_BASE_URL: "http://127.0.0.1:3005",
    P7_OWNER_STORAGE_STATE: ownerState, P7_OTHER_STORAGE_STATE: otherState,
    P7_OWNER_EMAIL: "owner@project-agent.test",
    P7_OTHER_EMAIL: "other@project-agent.test",
  };
  const opened = [], closed = [];
  const requester = { newContext: async options => {
    opened.push(options);
    const email = options.storageState === ownerState ? env.P7_OWNER_EMAIL : env.P7_OTHER_EMAIL;
    return { get: async () => ({ status: () => 200,
      json: async () => ({ user: { email } }) }),
      dispose: async () => { closed.push(email); } };
  } };
  try {
    assert.deepEqual(await p7SessionPreflight(env, requester), {
      isolated: true, ownerAuthenticated: true, nonmemberAuthenticated: true,
    });
    assert.equal(opened.length, 2);
    assert.equal(closed.length, 2);
    assert.equal(opened[0].baseURL, env.P7_HOST_BASE_URL);
    await assert.rejects(p7SessionPreflight(env, requester, true), /MUTATION_ALLOWED_ORIGIN/);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
