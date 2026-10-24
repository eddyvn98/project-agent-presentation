import { afterEach, describe, expect, it, vi } from "vitest";
import { nextWorkflowStep } from "../../lib/project-agent/workflow-branch";
import { auditFinalAnswer } from "../../lib/project-agent/runtime/final-audit";
import { estimatedModelCost, enforceTaskBudget, routeModelSelector } from "../../lib/project-agent/runtime/usage-pricing";
import { SAFE_AGENT_SKILL_CATALOG, skillCatalogEntry } from "../../lib/project-agent/skill-catalog";
import type { AgentWorkflowStep } from "../../lib/project-agent/workflow-types";
const step: AgentWorkflowStep = { id: "step_1", title: "Triage", prompt: "Triage",
  requiresApproval: true, route: { contains: "urgent", onMatch: "step_3", onOther: "next" } };
afterEach(() => vi.unstubAllEnvs());
describe("P3 safe forward-only workflow branching", () => {
  it("takes the matching branch based on completed task data", () => {
    expect(nextWorkflowStep(step,"done","This is URGENT",0,4,1)).toEqual({ nextIndex: 2, status: "ready" });
  });
  it("takes the next step when condition does not match", () => {
    expect(nextWorkflowStep(step,"done","normal priority",0,4,1)).toEqual({ nextIndex: 1, status: "ready" });
  });
  it("stops on failure by default", () => {
    expect(nextWorkflowStep(step,"failed","outage",0,4,1).status).toBe("failed");
  });
  it("continues after an explicitly recoverable failure", () => {
    expect(nextWorkflowStep({ ...step, onFailure: "next" },"failed","timeout",0,4,1))
      .toEqual({ nextIndex: 1, status: "ready" });
  });
  it("rejects backwards targets and imposes a transition cap", () => {
    const backwards = { ...step, route: { contains: "yes", onMatch: "step_1", onOther: "next" } };
    expect(nextWorkflowStep(backwards,"done","yes",1,4,1).status).toBe("failed");
    expect(nextWorkflowStep(step,"done","urgent",0,4,25).status).toBe("failed");
  });
  it("finishes when the final step returns a successful result", () => {
    expect(nextWorkflowStep({ ...step, route: undefined },"done","ok",3,4,1).status).toBe("done");
  });
});
describe("P3 bounded model usage and evidence-backed delivery", () => {
  it("accounts separately for input and output model pricing", () => {
    vi.stubEnv("PROJECT_AGENT_MODEL_PRICING_JSON", JSON.stringify({
      cheap: { inputPerMillion: 2, outputPerMillion: 6 },
    }));
    expect(estimatedModelCost("cheap",500000,100000)).toBeCloseTo(1.6,6);
    expect(estimatedModelCost("unpriced",1000,100)).toBeNull();
  });
  it("stops when the task token limit is reached", () => {
    vi.stubEnv("PROJECT_AGENT_TASK_MAX_TOKENS","1000");
    expect(() => enforceTaskBudget(900,101,"default")).toThrow(/budget/);
    expect(() => enforceTaskBudget(500,500,"default")).not.toThrow();
  });
  it("never routes to a model unless explicitly enabled", () => {
    vi.stubEnv("PROJECT_AGENT_MODEL_SIMPLE_SELECTOR","compact");
    expect(routeModelSelector("Summarize")).toBeUndefined();
    vi.stubEnv("PROJECT_AGENT_MODEL_ROUTING","1");
    expect(routeModelSelector("Summarize")).toBe("compact");
    vi.stubEnv("PROJECT_AGENT_MODEL_COMPLEX_SELECTOR","powerful");
    expect(routeModelSelector("Debug this code")).toBe("powerful");
  });
  it("refuses fabricated claims when no tool ran", () => {
    expect(auditFinalAnswer({ answer: "All tests passed", trace: [], attempts: 0 })).toMatch(/verification/i);
    expect(auditFinalAnswer({ answer: "I did not run tests", trace: [], attempts: 0 })).toBeNull();
  });
  it("accepts a test claim after a successful tool result", () => {
    expect(auditFinalAnswer({ answer: "Tests passed", trace: [{
      agent: "lead", kind: "action", name: "shell", ok: true, ms: 100, step: 1,
    }], attempts: 0 })).toBeNull();
  });
});
describe("P3 curated skills are advisory and opt-in", () => {
  it("contains only unique, bounded non-executable skill guidance", () => {
    expect(new Set(SAFE_AGENT_SKILL_CATALOG.map(x => x.id)).size).toBe(SAFE_AGENT_SKILL_CATALOG.length);
    expect(SAFE_AGENT_SKILL_CATALOG.length).toBeGreaterThanOrEqual(8);
    expect(SAFE_AGENT_SKILL_CATALOG.every(x => x.instructions.length < 700)).toBe(true);
    expect(skillCatalogEntry("../secret")).toBeNull();
  });
});
