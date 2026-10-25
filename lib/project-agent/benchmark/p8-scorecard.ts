import type { BrowserBenchmarkReport } from "./browser-runner";

export interface P8BenchmarkScorecard {
  scope: "synthetic-local"; total: number; passed: number; passRate: number;
  failed: number; retries: number; avgActions: number; avgDurationMs: number;
  categories: Array<{ name: string; total: number; passed: number }>;
  eligibleForAssistedPilot: boolean; reasons: string[];
}
/** Local verifier scores fixture outcomes, not self-reported agent claims. */
export function p8BenchmarkScorecard(report: BrowserBenchmarkReport): P8BenchmarkScorecard {
  const cases = report.cases;
  const categories = new Map<string, { name: string; total: number; passed: number }>();
  for (const test of cases) {
    const item = categories.get(test.category) ?? { name: test.category, total: 0, passed: 0 };
    item.total++;
    if (test.passed) item.passed++;
    categories.set(test.category, item);
  }
  const passed = cases.filter(test => test.passed).length;
  const failed = cases.length - passed;
  const retries = cases.reduce((n, test) => n + test.retries, 0);
  const reasons: string[] = [];
  if (report.kind !== "isolated-real-browser") reasons.push("Benchmark did not run on isolated Chromium");
  if (cases.length !== 40) reasons.push("Need all 40 independent synthetic browser fixtures");
  if (failed) reasons.push(failed + " synthetic fixtures failed independent verification");
  if (retries > 4) reasons.push("More than four browser-action retries");
  if (cases.some(test => test.durationMs > 10_000))
    reasons.push("One or more fixtures exceeded ten seconds");
  return { scope: "synthetic-local", total: cases.length, passed,
    passRate: cases.length ? Math.round(passed / cases.length * 1000) / 10 : 0,
    failed, retries,
    avgActions: cases.length ? Math.round(cases.reduce((n,c)=>n+c.actions,0)/cases.length*100)/100 : 0,
    avgDurationMs: cases.length ? Math.round(cases.reduce((n,c)=>n+c.durationMs,0)/cases.length) : 0,
    categories: [...categories.values()].sort((a,b) => a.name.localeCompare(b.name)),
    eligibleForAssistedPilot: reasons.length === 0, reasons };
}
