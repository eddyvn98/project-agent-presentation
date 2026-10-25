import { describe, expect, it } from "vitest";
import { runIsolatedBrowserBenchmark } from "../../lib/project-agent/benchmark/browser-runner";
import { p8BenchmarkScorecard } from "../../lib/project-agent/benchmark/p8-scorecard";

/** Explicit opt-in. Never contacts a user website or external model. */
describe("P8 independent Chromium browser quality gate", () => {
  it.skipIf(process.env.PROJECT_AGENT_P8_REAL_BROWSER_QA !== "1")(
    "completes and verifies all 40 in-memory website fixtures", async () => {
      const result = await runIsolatedBrowserBenchmark(40);
      const score = p8BenchmarkScorecard(result);
      expect(score.eligibleForAssistedPilot, score.reasons.join("; ")).toBe(true);
      expect(score.passed).toBe(40);
      expect(score.failed).toBe(0);
    }, 150000,
  );
});
