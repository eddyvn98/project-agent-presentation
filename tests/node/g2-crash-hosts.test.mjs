import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { crashEnvironment } from "../../scripts/g2-crash-hosts.mjs";

function synthetic() {
  const dir = mkdtempSync(join(tmpdir(), "g2-crash-fixture-"));
  const roots = ["a", "b"].map(name => join(dir, name));
  const runId = "a".repeat(12), projectId = "project_synthetic_g2";
  for (const root of roots) {
    mkdirSync(join(root, "node_modules", "next", "dist", "bin"),
      { recursive: true });
    writeFileSync(join(root, "node_modules", "next", "dist", "bin", "next"), "");
    writeFileSync(join(root, ".g2-crash-qa.json"), JSON.stringify({
      purpose: "g2-isolated-crash", runId, projectId, allowStart: true,
    }));
  }
  const vars = { P7_HOST_BASE_URL: "http://localhost:3005",
    G2_QA_OTHER_ORIGIN: "http://localhost:3006",
    P8_QA_ALLOWED_ORIGIN: "http://localhost:3005",
    P7_PROJECT_ID: projectId, PROJECT_AGENT_P7_QA_PROJECT_ID: projectId,
    G2_QA_RUN_ID: runId, G2_QA_REVIEW_TICKET: "b".repeat(24),
    G2_QA_CHECKOUT_A: roots[0], G2_QA_CHECKOUT_B: roots[1],
    PROJECT_AGENT_RUNTIME: "sandbox", PROJECT_AGENT_DURABLE_QUEUE: "0",
    PROJECT_AGENT_P8_LOOP_REPORT_ONLY: "0" };
  for (const key of ["P7_ISOLATED_QA", "P8_QA_ISOLATED_HOST",
    "P8_QA_ALLOW_CLOSEOUT", "G2_ISOLATED_QA",
    "PROJECT_AGENT_G2_BROWSER_OWNERSHIP", "G2_QA_CRASH_RECOVERY",
    "G2_QA_ALLOW_CRASH", "PROJECT_AGENT_P8_QA_SESSION",
    "PROJECT_AGENT_P8_LOOP", "PROJECT_AGENT_BROWSER_AGENT",
    "PROJECT_AGENT_P7_QA_FIXTURE"]) vars[key] = "1";
  return { dir, roots, vars };
}
test("preflight accepts separate exact marked Next checkouts and localhost", () => {
  const qa = synthetic();
  try {
    const found = crashEnvironment(qa.vars);
    assert.notEqual(found.paths[0], found.paths[1]);
    assert.equal(found.a, "http://localhost:3005");
  } finally { rmSync(qa.dir, { recursive: true, force: true }); }
});
test("rejects missing consent, mismatched marker and reused build dir", () => {
  const qa = synthetic();
  try {
    assert.throws(() => crashEnvironment({ ...qa.vars,
      G2_QA_ALLOW_CRASH: "0" }), /required/);
    assert.throws(() => crashEnvironment({ ...qa.vars,
      G2_QA_CHECKOUT_B: qa.roots[0] }), /non-overlapping/);
    assert.throws(() => crashEnvironment({ ...qa.vars,
      G2_QA_RUN_ID: "c".repeat(12) }), /Invalid exact run marker/);
    mkdirSync(join(qa.roots[0], ".next"));
    symlinkSync(join(qa.roots[0], ".next"), join(qa.roots[1], ".next"));
    assert.throws(() => crashEnvironment(qa.vars), /cannot share .next/);
  } finally { rmSync(qa.dir, { recursive: true, force: true }); }
});
