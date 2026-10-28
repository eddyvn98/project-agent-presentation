import { test } from "node:test";
import assert from "node:assert/strict";
import { steelQaLiveGate } from "../../scripts/steel-host-qa-guard.mjs";

const valid = () => ({
  NODE_ENV: "test", STEEL_QA_ALLOW_LIVE: "1",
  STEEL_QA_DB_ISOLATION_ATTESTED: "1",
  PROJECT_AGENT_RUNTIME: "sandbox", PROJECT_AGENT_STEEL_BROWSER: "1",
  PROJECT_AGENT_STEEL_API_URL: "https://api.steel.dev",
  PROJECT_AGENT_STEEL_API_KEY: "synthetic-only",
  PROJECT_AGENT_STEEL_SESSION_TIMEOUT_MS: "300000",
  P7_PROJECT_ID: "qa-project", PROJECT_AGENT_P7_QA_PROJECT_ID: "qa-project",
  P7_OWNER_EMAIL: "owner@example.test", P7_OTHER_EMAIL: "other@example.test",
  P7_ISOLATED_QA: "1", P8_QA_ISOLATED_HOST: "1",
});
test("Real-host Steel QA gate accepts explicitly scoped synthetic setup", () => {
  assert.deepEqual(steelQaLiveGate(valid()), {
    apiOrigin: "https://api.steel.dev", timeout: 300000, projectId: "qa-project",
  });
});
test("Refuses live Steel without explicit opt-in, scope, or credential", () => {
  const cases = [
    ["STEEL_QA_ALLOW_LIVE", "0"],
    ["STEEL_QA_DB_ISOLATION_ATTESTED", "0"],
    ["PROJECT_AGENT_RUNTIME", "dify"],
    ["PROJECT_AGENT_STEEL_BROWSER", "0"],
    ["PROJECT_AGENT_STEEL_API_KEY", ""],
    ["PROJECT_AGENT_STEEL_API_URL", "https://user:secret@api.steel.dev"],
    ["PROJECT_AGENT_STEEL_API_URL", "https://evil.example.test"],
    ["PROJECT_AGENT_STEEL_API_URL", "http://api.steel.dev"],
    ["PROJECT_AGENT_STEEL_API_URL", "https://api.steel.dev/v1/"],
    ["PROJECT_AGENT_STEEL_SESSION_TIMEOUT_MS", "86400000"],
    ["P7_PROJECT_ID", "wrong-project"],
    ["P7_OTHER_EMAIL", "owner@example.test"],
    ["P8_QA_ISOLATED_HOST", "0"],
    ["PROJECT_AGENT_STEEL_PRIVATE_VIEWER", "1"],
    ["PROJECT_AGENT_STEEL_LOCAL_VIEWER", "1"],
    ["NODE_ENV", "production"],
  ];
  for (const [name, value] of cases) {
    assert.throws(() => steelQaLiveGate({ ...valid(), [name]: value }),
      undefined, name + " must be rejected");
  }
});
test("Supports only pinned trusted self-hosted API or loopback", () => {
  const env = valid();
  assert.equal(steelQaLiveGate({ ...env,
    PROJECT_AGENT_STEEL_API_URL: "http://127.0.0.1:3000",
  }).apiOrigin, "http://127.0.0.1:3000");
  assert.throws(() => steelQaLiveGate({ ...env,
    PROJECT_AGENT_STEEL_API_URL: "https://qa.steel.example",
  }), /allowlisted/);
  assert.equal(steelQaLiveGate({ ...env,
    PROJECT_AGENT_STEEL_API_URL: "https://qa.steel.example",
    STEEL_QA_TRUSTED_API_HOST: "qa.steel.example",
  }).apiOrigin, "https://qa.steel.example");
});
test("Rejects unsafe session lifetime and malformed project/owner identities", () => {
  for (const timeout of ["0", "5000", "900001", "NaN", "4.5"]) {
    assert.throws(() => steelQaLiveGate({ ...valid(),
      PROJECT_AGENT_STEEL_SESSION_TIMEOUT_MS: timeout }), /timeout/);
  }
  assert.throws(() => steelQaLiveGate({ ...valid(),
    P7_OWNER_EMAIL: "owner-without-at" }), /identities/);
});
