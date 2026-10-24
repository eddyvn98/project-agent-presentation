import { describe, expect, it } from "vitest";
import { runIsolatedBrowserBenchmark } from "../../lib/project-agent/benchmark/browser-runner";
/** Opt in on a local machine with Chromium and working Playwright configured. */
describe("P3 isolated Chromium benchmark", () => {
  it.skipIf(process.env.PROJECT_AGENT_P3_BROWSER_QA !== "1")(
    "executes all 40 local synthetic interactions without network or user sessions", async () => {
      const result = await runIsolatedBrowserBenchmark(40);
      expect(result.total).toBe(40);
      expect(result.passed).toBe(40);
      expect(result.cases.every(c => c.passed)).toBe(true);
    }, 150000,
  );
});
