import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectP7Host } from "../../scripts/p7-host-readiness.mjs";
const requestWith = (authStatus, chatStatus = 200) => async url => {
  const auth = url.pathname.includes("/api/auth/providers");
  const status = auth ? authStatus : chatStatus;
  return new Response(auth && status === 200 ? JSON.stringify({ "azure-ad": {} }) : "QA only", { status });
};
test("detects a host that cannot be reached", async () => {
  const result = await inspectP7Host("http://127.0.0.1:3004", async () => {
    throw new TypeError("synthetic fetch error");
  });
  assert.equal(result.blocker, "HOST_UNREACHABLE");
  assert.equal(result.ready, false);
});
test("distinguishes a timed-out /assistant after auth providers responded", async () => {
  const request = async url => {
    if (url.pathname.includes("/api/auth/providers"))
      return new Response(JSON.stringify({ "azure-ad": {} }), { status: 200 });
    throw Object.assign(new Error("deadline"), { name: "TimeoutError" });
  };
  const result = await inspectP7Host("http://127.0.0.1:3004", request);
  assert.equal(result.blocker, "CHAT_ROUTE_TIMEOUT");
  assert.deepEqual(result.checks.map(item => item.name), ["auth_providers", "chat_route"]);
  assert.equal(result.checks[0].status, 200);
  assert.equal(result.checks[1].status, null);
});
test("distinguishes a route-specific network failure and guards bad timeouts", async () => {
  const request = async url => {
    if (url.pathname.includes("/api/auth/providers"))
      return new Response(JSON.stringify({ "azure-ad": {} }), { status: 200 });
    throw new TypeError("route disconnected");
  };
  assert.equal((await inspectP7Host("http://127.0.0.1:3004", request)).blocker,
    "CHAT_ROUTE_NETWORK_ERROR");
  await assert.rejects(inspectP7Host("http://127.0.0.1:3004", request, "/assistant", 0),
    /readiness timeout/);
});
test("identifies NextAuth provider HTTP 500 and chat HTTP 500 separately", async () => {
  assert.equal((await inspectP7Host("http://127.0.0.1:3004",
    requestWith(500))).blocker, "HOST_SERVER_ERROR");
  const chatFailure = await inspectP7Host("http://127.0.0.1:3004", requestWith(200, 500));
  assert.equal(chatFailure.blocker, "HOST_SERVER_ERROR");
  assert.equal(chatFailure.checks[1].name, "chat_route");
});
test("accepts a valid auth provider and a signed-out redirect without claiming login", async () => {
  const result = await inspectP7Host("http://127.0.0.1:3004", requestWith(200, 307));
  assert.equal(result.ready, true);
  assert.equal(result.checks.length, 2);
});
test("never probes a remote host or credential-bearing URL by default", async () => {
  await assert.rejects(inspectP7Host("http://example.com", requestWith(200)), /Remote probe/);
  await assert.rejects(inspectP7Host("http://alice:secret@127.0.0.1:3004",
    requestWith(200)), /bare host/);
});
