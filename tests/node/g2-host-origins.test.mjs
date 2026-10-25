import assert from "node:assert/strict";
import { test } from "node:test";
import { g2HostOrigins } from "../../scripts/g2-host-origins.mjs";

const env = host => ({
  P7_HOST_BASE_URL: `http://${host}:3005`,
  G2_QA_OTHER_ORIGIN: `http://${host}:3006`,
  P8_QA_ALLOWED_ORIGIN: `http://${host}:3005`,
});
test("two exact localhost Next origins allowed", () => {
  assert.deepEqual(g2HostOrigins(env("localhost")), {
    a: "http://localhost:3005", b: "http://localhost:3006",
  });
});
test("two exact IPv4 loopback Next origins allowed", () => {
  assert.deepEqual(g2HostOrigins(env("127.0.0.1")), {
    a: "http://127.0.0.1:3005", b: "http://127.0.0.1:3006",
  });
});
test("mixed hostname and conflicting allowed origin fail closed", () => {
  assert.throws(() => g2HostOrigins({ ...env("localhost"),
    G2_QA_OTHER_ORIGIN: "http://127.0.0.1:3006" }), /same hostname/);
  assert.throws(() => g2HostOrigins({ ...env("localhost"),
    P8_QA_ALLOWED_ORIGIN: "http://127.0.0.1:3005" }), /allowed origin/);
});
test("reject remote, wrong ports, path, credentials and HTTPS", () => {
  for (const value of ["https://localhost:3005", "http://example.com:3005",
    "http://localhost:3004", "http://localhost:3005/test",
    "http://user:secret@localhost:3005", "http://localhost:3005?x=1"]) {
    assert.throws(() => g2HostOrigins({ ...env("localhost"),
      P7_HOST_BASE_URL: value }), /G2 requires/);
  }
});
