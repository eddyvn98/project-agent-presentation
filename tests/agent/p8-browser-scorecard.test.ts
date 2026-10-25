import { describe, expect, it } from "vitest";
import type { BrowserBenchmarkReport } from "../../lib/project-agent/benchmark/browser-runner";
import { p8BenchmarkScorecard } from "../../lib/project-agent/benchmark/p8-scorecard";

function sample(total = 40, failureIndex = -1, retries = 0): BrowserBenchmarkReport {
  const cases = Array.from({ length: total }, (_, index) => ({
    id: "fixture-" + index, category: ["form", "navigation", "search"][index % 3],
    passed: index !== failureIndex, actions: 2, retries: index === 0 ? retries : 0,
    durationMs: 100,
  }));
  return { cases, passed: cases.filter(x=>x.passed).length, total,
    passRate: 100, totalActions: total * 2, retries, durationMs: total * 100,
    executedAt: "2026-10-25T00:00:00Z", kind: "isolated-real-browser" };
}
describe("P8 independent local browser scorecard", () => {
  it("accepts 40 independently verified fixtures with bounded retries", () => {
    const score = p8BenchmarkScorecard(sample());
    expect(score).toMatchObject({ total: 40, passed: 40, failed: 0,
      passRate: 100, eligibleForAssistedPilot: true, avgActions: 2 });
    expect(score.categories).toHaveLength(3);
  });
  it("cannot pass if one independent outcome fails", () => {
    const score = p8BenchmarkScorecard(sample(40, 8));
    expect(score.eligibleForAssistedPilot).toBe(false);
    expect(score.reasons.join(" ")).toContain("failed");
    expect(score.passRate).toBe(97.5);
  });
  it("partial or high-retry results are never green", () => {
    expect(p8BenchmarkScorecard(sample(20)).eligibleForAssistedPilot).toBe(false);
    expect(p8BenchmarkScorecard(sample(40, -1, 5)).eligibleForAssistedPilot).toBe(false);
  });
  it("uses cases as evidence, not a self-declared passing count", () => {
    const score = p8BenchmarkScorecard({ ...sample(40, 2), passed: 40 });
    expect(score.passed).toBe(39);
    expect(score.eligibleForAssistedPilot).toBe(false);
  });
});
