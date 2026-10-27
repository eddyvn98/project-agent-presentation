import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

test("L15 repeat-load regression keeps 5000-turn UI stable", async ({ page }, info) => {
  test.setTimeout(100_000);
  await page.setViewportSize({ width: 1280, height: 850 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const samples: Array<{ heap: number; dom: number; ms: number }> = [];
  for (let run = 0; run < 7; run++) {
    const start = Date.now();
    await page.goto("/long-chat-qa.html");
    await expect(page.getByTestId("qa-message")).toHaveCount(80);
    await cdp.send("HeapProfiler.collectGarbage");
    const report = await cdp.send("Performance.getMetrics");
    const heap = report.metrics.find(m => m.name === "JSHeapUsedSize")?.value ?? 0;
    const dom = await page.locator("*").count();
    samples.push({ heap: Math.round(heap / 1048576), dom, ms: Date.now() - start });
  }
  const first = samples[0], subsequent = samples.slice(1);
  const final = samples.at(-1)!;
  // Relative same-run baseline; avoid pretending CI runner speed is a production SLA.
  expect(Math.max(...subsequent.map(s => s.dom)) - first.dom).toBeLessThan(2500);
  expect(final.heap - first.heap).toBeLessThan(100);
  expect(subsequent.every(s => s.ms < 60_000)).toBe(true);
  await mkdir("test-results/l15-l16", { recursive: true });
  await writeFile("test-results/l15-l16/l15-" + info.project.name + ".json",
    JSON.stringify({ l15: "PASS", comparisons: samples.length,
      syntheticMessages: 5000, samples }, null, 2));
});

test("L16 repeated browser contexts close all pages and listeners", async ({ browser }) => {
  test.setTimeout(100_000);
  const baseline = browser.contexts().length;
  for (let i = 0; i < 12; i++) {
    const context = await browser.newContext({ viewport: { width: i % 2 ? 390 : 1280,
      height: 840 } });
    let pages = 0;
    const onPage = () => { pages++; };
    context.on("page", onPage);
    try {
      const page = await context.newPage();
      await page.goto("/long-chat-qa.html");
      await expect(page.getByTestId("qa-message")).toHaveCount(80);
      expect(pages).toBe(1);
      expect(context.pages()).toHaveLength(1);
      context.off("page", onPage);
    } finally {
      await context.close();
    }
    expect(browser.contexts().length).toBe(baseline);
  }
});
