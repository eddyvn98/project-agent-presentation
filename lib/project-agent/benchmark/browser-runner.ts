import { launchChromium } from "../runtime/browser-launcher";
import { browserBenchmarkFixtures, type BrowserBenchmarkCase } from "./fixtures";
export interface BrowserBenchmarkResult {
  id: string; category: string; passed: boolean; actions: number;
  retries: number; durationMs: number; error?: string;
}
export interface BrowserBenchmarkReport {
  cases: BrowserBenchmarkResult[]; passed: number; total: number;
  passRate: number; totalActions: number; retries: number; durationMs: number;
  executedAt: string; kind: "isolated-real-browser";
}
async function runCase(browser: Awaited<ReturnType<typeof launchChromium>>,
  fixture: BrowserBenchmarkCase): Promise<BrowserBenchmarkResult> {
  const started = Date.now(), context = await browser.newContext({
    serviceWorkers: "block", acceptDownloads: false, viewport: { width: 1024, height: 720 },
  });
  let retries = 0, actions = 0, passed = false, error = "";
  try {
    await context.route("**/*", route => route.abort("blockedbyclient"));
    const page = await context.newPage();
    await page.setContent(fixture.html, { waitUntil: "domcontentloaded" });
    for (const command of fixture.actions) {
      let last: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const element = page.locator(command.selector);
          if (command.op === "click") await element.click({ timeout: 1600 });
          else if (command.op === "fill") await element.fill(command.value ?? "", { timeout: 1600 });
          else if (command.op === "select") await element.selectOption(command.value ?? "", { timeout: 1600 });
          else await element.check({ timeout: 1600 });
          last = null; break;
        } catch (cause) { last = cause; if (attempt === 0) retries++; }
      }
      if (last) throw last;
      actions++;
    }
    await page.waitForFunction(({ selector, expected, visible }) => {
      const element = document.querySelector(selector) as HTMLElement | null;
      if (!element) return false;
      if (visible !== undefined && !((element.offsetWidth > 0 || element.offsetHeight > 0) === visible)) return false;
      return expected === undefined || element.textContent?.trim() === expected;
    }, { selector: fixture.verify.selector, expected: fixture.verify.text,
      visible: fixture.verify.visible }, { timeout: 2000 });
    passed = true;
  } catch (cause) {
    error = (cause instanceof Error ? cause.message : "Unknown error").split("\n")[0].slice(0, 180);
  } finally { await context.close(); }
  return { id: fixture.id, category: fixture.category, passed, actions,
    retries, durationMs: Date.now() - started, ...(error ? { error } : {}) };
}
/** Browser interactions execute against 40 isolated in-memory pages, no remote network. */
export async function runIsolatedBrowserBenchmark(limit = 40): Promise<BrowserBenchmarkReport> {
  const started = Date.now(), fixtures = browserBenchmarkFixtures().slice(0, Math.max(1, Math.min(40, limit)));
  const browser = await launchChromium();
  const results: BrowserBenchmarkResult[] = [];
  try { for (const fixture of fixtures) results.push(await runCase(browser, fixture)); }
  finally { await browser.close(); }
  const passed = results.filter(r => r.passed).length;
  return { cases: results, passed, total: results.length,
    passRate: results.length ? Math.round(passed / results.length * 1000) / 10 : 0,
    totalActions: results.reduce((n,r) => n+r.actions,0),
    retries: results.reduce((n,r) => n+r.retries,0), durationMs: Date.now()-started,
    executedAt: new Date().toISOString(), kind: "isolated-real-browser" };
}
