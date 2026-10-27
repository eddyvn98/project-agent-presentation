import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

for (const width of [390, 1280]) {
  test("L5B 5000-turn rich chat load, DOM/heap and repeated expansion " + width,
    async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 840 });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");
      const sample = async () => {
        await cdp.send("HeapProfiler.collectGarbage");
        const result = await cdp.send("Performance.getMetrics");
        const metric = (name: string) => result.metrics.find(m => m.name === name)?.value ?? 0;
        return { heapMb: Math.round(metric("JSHeapUsedSize") / 1048576),
          nodes: Math.round(metric("Nodes")), frames: Math.round(metric("Frames")) };
      };
      const errors: string[] = [];
      page.on("pageerror", e => errors.push(e.message));
      const started = Date.now();
      await page.goto("/long-chat-qa.html");
      await expect(page.getByTestId("qa-message")).toHaveCount(80);
      const loadMs = Date.now() - started;
      const before = await sample();
      const scroll = page.getByTestId("qa-scroll");
      const expand = Date.now();
      await scroll.evaluate(el => { el.scrollTop = 0; });
      await page.getByRole("button", { name: "Show earlier loaded messages" }).click();
      await expect(page.getByTestId("qa-message")).toHaveCount(160);
      const expandMs = Date.now() - expand;
      const expanded = await sample();
      const reloads: Array<{ heapMb: number; nodes: number; frames: number }> = [];
      for (let i = 0; i < 3; i++) {
        await page.reload();
        await expect(page.getByTestId("qa-message")).toHaveCount(80);
        reloads.push(await sample());
      }
      await mkdir("test-results/l5b", { recursive: true });
      const report = { viewport: width, project: testInfo.project.name,
        syntheticTurns: 5000, initialMounted: 80, expandedMounted: 160,
        loadMs, expandMs, before, expanded, reloads, errors };
      await writeFile("test-results/l5b/" + testInfo.project.name + "-" + width + ".json",
        JSON.stringify(report, null, 2));
      expect(errors).toEqual([]);
      expect(before.nodes).toBeGreaterThan(0);
      expect(expanded.nodes).toBeGreaterThan(before.nodes);
      expect(expanded.nodes).toBeLessThan(100_000);
      expect(expanded.heapMb).toBeLessThan(480);
      expect(loadMs).toBeLessThan(60_000);
      expect(expandMs).toBeLessThan(60_000);
      expect(Math.max(...reloads.map(x => x.heapMb))).toBeLessThan(480);
      expect(reloads.at(-1)!.heapMb - reloads[0].heapMb).toBeLessThan(150);
      expect(await page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width + 2);
    });
}
