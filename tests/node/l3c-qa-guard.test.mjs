import assert from "node:assert/strict";
import { test } from "node:test";
import { l3cQaAllowed } from "../../lib/project-agent/l3c-qa-guard.mjs";
function values() {
  return { env: { NODE_ENV: "development", P7_ISOLATED_QA: "1",
      G2_QA_DB_ISOLATION_ATTESTED: "1",
      PROJECT_AGENT_L3C_QA_CHECKPOINT: "1",
      PROJECT_AGENT_CONTEXT_CHECKPOINT_BACKEND: "mongo",
      PROJECT_AGENT_RUNTIME: "sandbox", G2_QA_RUN_ID: "a".repeat(12),
      P7_PROJECT_ID: "qa-project", PROJECT_AGENT_P7_QA_PROJECT_ID: "qa-project" },
    projectId: "qa-project", chatId: "l3c_" + "a".repeat(12),
    owner: "owner@project-agent.test", caller: "owner@project-agent.test",
    projectName: "P7 QA Synthetic aaaaaaaa", method: "POST",
    originHeader: "http://localhost:3005", origin: "http://localhost:3005" };
}
test("L3C guard accepts only owner of exact synthetic local Project", () => {
  assert.equal(l3cQaAllowed(values()), true);
  for (const [field, change] of [
    ["projectId", "different"], ["chatId", "real-employee-chat"],
    ["caller", "outsider@project-agent.test"], ["projectName", "Employee data"],
    ["origin", "https://example.com"], ["originHeader", "http://localhost:3006"],
  ]) assert.equal(l3cQaAllowed({ ...values(), [field]: change }), false, field);
});
test("L3C rejects production, non-Mongo, missing consent and public origins", () => {
  for (const [field, change] of [
    ["NODE_ENV", "production"], ["P7_ISOLATED_QA", "0"],
    ["G2_QA_DB_ISOLATION_ATTESTED", "0"],
    ["PROJECT_AGENT_L3C_QA_CHECKPOINT", "0"],
    ["PROJECT_AGENT_CONTEXT_CHECKPOINT_BACKEND", "local"],
    ["G2_QA_RUN_ID", "unmarked"],
  ]) assert.equal(l3cQaAllowed({ ...values(), env: { ...values().env, [field]: change } }), false, field);
  assert.equal(l3cQaAllowed({ ...values(), origin: "http://localhost:3004",
    originHeader: "http://localhost:3004" }), false);
});
