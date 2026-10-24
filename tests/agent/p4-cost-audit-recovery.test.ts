import { afterEach, describe, expect, it } from "vitest";
import { estimatedModelCost, enforceTaskBudget, routeModelSelector } from "../../lib/project-agent/runtime/usage-pricing";
import { queueRecoveryDecision } from "../../lib/project-agent/recovery-decision";
import { auditFinalAnswer } from "../../lib/project-agent/runtime/final-audit";

const saved = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

describe("P4 cost estimates and budget regressions", () => {
  it("never displays unknown model pricing as zero", () => {
    delete process.env.PROJECT_AGENT_MODEL_PRICING_JSON;
    expect(estimatedModelCost("unpriced", 1000, 1000)).toBeNull();
  });
  it("computes estimates from configured rates with no hidden fallback", () => {
    process.env.PROJECT_AGENT_MODEL_PRICING_JSON = JSON.stringify({
      verified: { inputPerMillion: 2, outputPerMillion: 8 },
    });
    expect(estimatedModelCost("verified", 1_000_000, 250_000)).toBe(4);
    expect(estimatedModelCost("missing", 1_000, 500)).toBeNull();
  });
  it("rejects malformed and negative price table entries", () => {
    process.env.PROJECT_AGENT_MODEL_PRICING_JSON = JSON.stringify({
      negative: { inputPerMillion: -1, outputPerMillion: 2 },
      string: { inputPerMillion: "1", outputPerMillion: 2 },
    });
    expect(estimatedModelCost("negative", 10, 10)).toBeNull();
    expect(estimatedModelCost("string", 10, 10)).toBeNull();
    process.env.PROJECT_AGENT_MODEL_PRICING_JSON = "{";
    expect(estimatedModelCost("anything", 1, 1)).toBeNull();
  });
  it("enforces task token and priced-dollar caps independently", () => {
    process.env.PROJECT_AGENT_TASK_MAX_TOKENS = "100";
    expect(() => enforceTaskBudget(80, 21, "missing")).toThrow(/token budget/);
    process.env.PROJECT_AGENT_TASK_MAX_TOKENS = "0";
    process.env.PROJECT_AGENT_TASK_MAX_COST_USD = "0.000001";
    process.env.PROJECT_AGENT_MODEL_PRICING_JSON = JSON.stringify({
      priced: { inputPerMillion: 1, outputPerMillion: 1 },
    });
    expect(() => enforceTaskBudget(20, 20, "priced")).toThrow(/cost budget/);
    expect(() => enforceTaskBudget(20, 20, "unknown")).not.toThrow();
  });
  it("routes only when opted in and selectors are safe", () => {
    process.env.PROJECT_AGENT_MODEL_SIMPLE_SELECTOR = "cheap";
    process.env.PROJECT_AGENT_MODEL_COMPLEX_SELECTOR = "deep";
    delete process.env.PROJECT_AGENT_MODEL_ROUTING;
    expect(routeModelSelector("debug repository")).toBeUndefined();
    process.env.PROJECT_AGENT_MODEL_ROUTING = "1";
    expect(routeModelSelector("short summary")).toBe("cheap");
    expect(routeModelSelector("debug repository")).toBe("deep");
    process.env.PROJECT_AGENT_MODEL_COMPLEX_SELECTOR = "../bad?key";
    expect(routeModelSelector("debug repository")).toBeUndefined();
  });
});

describe("P4 recovery decision matrix", () => {
  it("does not replay running or uncertain side effects", () => {
    expect(queueRecoveryDecision("queued", "running", true)).toBe("review");
    expect(queueRecoveryDecision("running", "running", true)).toBe("review");
    expect(queueRecoveryDecision("running", "running", false)).toBe("wait");
    expect(queueRecoveryDecision("needs_review", "queued", true)).toBe("review");
  });
  it("dispatches only safe queued work and preserves terminal outcomes", () => {
    expect(queueRecoveryDecision("queued", "queued", true)).toBe("dispatch");
    expect(queueRecoveryDecision("queued", null, true)).toBe("fail");
    expect(queueRecoveryDecision("done", "running", true)).toBe("complete");
    expect(queueRecoveryDecision("failed", "running", true)).toBe("fail");
    expect(queueRecoveryDecision("running", "done", true)).toBe("complete");
  });
});

describe("P4 final claim audit", () => {
  it("blocks unsupported testing and browsing claims", () => {
    expect(auditFinalAnswer({ answer: "Tests all passed", trace: [], attempts: 0 })).toMatch(/verification/);
    expect(auditFinalAnswer({ answer: "I searched the web", trace: [], attempts: 0 })).toMatch(/web research/);
  });
  it("permits evidence-backed and appropriately cautious answers", () => {
    const trace = [{ kind: "action", ok: true, name: "browser" }] as Parameters<typeof auditFinalAnswer>[0]["trace"];
    expect(auditFinalAnswer({ answer: "Verified in browser", trace, attempts: 0 })).toBeNull();
    expect(auditFinalAnswer({ answer: "Browser tests have not been run", trace: [], attempts: 0 })).toBeNull();
  });
});
