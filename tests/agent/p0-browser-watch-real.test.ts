import { afterEach, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { captureBrowserWatch, browserWatchImage, browserWatchStatus,
  setBrowserWatch } from "../../lib/project-agent/runtime/browser-agent/watch";
import { takeBrowserControl, browserControlState, waitForBrowserHandoff,
  releaseBrowserControl, clearBrowserControl } from "../../lib/project-agent/runtime/browser-agent/control";

const task = "pat_123456abcdef", other = "pat_987654fedcba";
let browser: Browser | undefined;
afterEach(async () => {
  setBrowserWatch(task, false); setBrowserWatch(other, false);
  clearBrowserControl(task); clearBrowserControl(other);
  await browser?.close(); browser = undefined;
});

describe("P0 isolated real Chromium Browser Watch and takeover", () => {
  it.skipIf(process.env.PROJECT_AGENT_P8_REAL_BROWSER_QA !== "1")(
    "captures two real pages, blocks Agent during takeover, survives handback and purges on Stop",
    async () => {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage(), tab = await context.newPage();
      await page.setContent('<main><h1>QA only</h1><input aria-label="secret" value="private" />' +
        '<button id="counter" onclick="document.querySelector(\'#count\').textContent=String(Number(document.querySelector(\'#count\').textContent)+1)">Increment</button>' +
        '<span id="count">0</span></main>');
      await tab.setContent("<h1>Second isolated tab</h1>");
      setBrowserWatch(task, true); setBrowserWatch(other, true);
      await captureBrowserWatch(task, page, "Initial snapshot");
      await captureBrowserWatch(other, tab, "Other tab snapshot");
      expect(browserWatchImage(task)).toBeInstanceOf(Buffer);
      expect(browserWatchImage(other)).toBeInstanceOf(Buffer);
      expect(browserWatchStatus(task)?.history).toHaveLength(1);
      takeBrowserControl(task);
      let resumed = false;
      const agent = waitForBrowserHandoff(task).then(async () => {
        resumed = true; await page.locator("#counter").click();
      });
      await page.locator("#counter").click(); // User's manual takeover action.
      expect(await page.locator("#count").textContent()).toBe("1");
      expect(resumed).toBe(false);
      await captureBrowserWatch(task, page, "Manual click", { x: 0.5, y: 0.4, kind: "human" });
      expect(browserWatchStatus(task)?.history.at(-1)?.marker?.kind).toBe("human");
      releaseBrowserControl(task);
      await agent;
      expect(await page.locator("#count").textContent()).toBe("2");
      await captureBrowserWatch(task, page, "Agent resumed");
      expect(browserWatchStatus(task)?.sequence).toBe(3);
      expect(browserWatchStatus(other)?.sequence).toBe(1);
      setBrowserWatch(task, false); setBrowserWatch(other, false);
      expect(browserWatchImage(task)).toBeNull();
      expect(browserWatchImage(other)).toBeNull();
    }, 30000,
  );

  it.skipIf(process.env.PROJECT_AGENT_P8_REAL_BROWSER_QA !== "1")(
    "aborted Agent handoff cannot execute a deferred click", async () => {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.setContent('<button id="count" onclick="this.textContent=\'clicked\'">safe</button>');
      takeBrowserControl(task);
      const controller = new AbortController();
      const attempt = waitForBrowserHandoff(task, controller.signal)
        .then(() => page.locator("#count").click());
      controller.abort(new Error("Task stopped"));
      await expect(attempt).rejects.toThrow("Task stopped");
      expect(await page.locator("#count").textContent()).toBe("safe");
      expect(browserControlState(task).paused).toBe(true);
    }, 30000,
  );
});
