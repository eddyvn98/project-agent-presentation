import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { withBrowserOp } from "../../lib/project-agent/runtime/browser-agent/session";
import { clearBrowserControl, releaseBrowserControl, takeBrowserControl }
  from "../../lib/project-agent/runtime/browser-agent/control";
import { browserWatchImage, browserWatchStatus, captureBrowserWatch, setBrowserWatch }
  from "../../lib/project-agent/runtime/browser-agent/watch";

const a = "pat_112233aabbcc", b = "pat_556677ddeeff";
let browser: Browser;
const contexts: BrowserContext[] = [];
const counterHtml = '<button id="counter" onclick="this.textContent=String(Number(this.textContent)+1)">0</button>';
const prepare = async (id = a) => {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  await page.setContent(counterHtml);
  const session = { scopeId: id, owner: "owner@project-agent.test",
    context, page, browser, operationCount: 0, persistent: false,
    close: vi.fn(async () => context.close()), lastUsed: 0 };
  return { session, page };
};
const gate = () => {
  let unblock!: () => void, started!: () => void;
  const pending = new Promise<void>(resolve => { unblock = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  return { pending, ready, unblock, started };
};
beforeAll(async () => {
  if (process.env.PROJECT_AGENT_P8_REAL_BROWSER_QA === "1")
    browser = await chromium.launch({ headless: true });
});
afterEach(async () => {
  for (const id of [a, b]) { setBrowserWatch(id, false); clearBrowserControl(id); }
  await Promise.all(contexts.splice(0).map(context => context.close().catch(() => {})));
});
afterAll(async () => { await browser?.close(); });
describe("C7A/C7C/C7E real Chromium Stop, takeover and isolation", () => {
  it.skipIf(process.env.PROJECT_AGENT_P8_REAL_BROWSER_QA !== "1")(
    "Stop fences a queued click even after Chromium is unlocked", async () => {
      const { session, page } = await prepare();
      const g = gate(), stop = new AbortController();
      const first = withBrowserOp(session as never,
        async () => { g.started(); await g.pending; }, false, "system");
      await g.ready;
      const click = vi.fn(async () => page.locator("#counter").click());
      const queued = withBrowserOp(session as never, click, true, "agent",
        a, stop.signal, "click");
      stop.abort(new Error("Task stopped"));
      g.unblock(); await first;
      await expect(queued).rejects.toThrow("Task stopped");
      expect(click).not.toHaveBeenCalled();
      expect(await page.locator("#counter").innerText()).toBe("0");
    }, 30000);
  it.skipIf(process.env.PROJECT_AGENT_P8_REAL_BROWSER_QA !== "1")(
    "takeover invalidates queued refs; human click and fresh agent handback are distinct", async () => {
      const { session, page } = await prepare();
      const g = gate();
      const first = withBrowserOp(session as never,
        async () => { g.started(); await g.pending; }, false, "system");
      await g.ready;
      const staleClick = vi.fn(async () => page.locator("#counter").click());
      const queued = withBrowserOp(session as never, staleClick, true, "agent", a);
      takeBrowserControl(a);
      await page.locator("#counter").click();
      releaseBrowserControl(a);
      g.unblock(); await first;
      await expect(queued).rejects.toThrow(/control changed/i);
      expect(staleClick).not.toHaveBeenCalled();
      expect(await page.locator("#counter").innerText()).toBe("1");
      await withBrowserOp(session as never, () => page.locator("#counter").click(),
        true, "agent", a);
      expect(await page.locator("#counter").innerText()).toBe("2");
    }, 30000);
  it.skipIf(process.env.PROJECT_AGENT_P8_REAL_BROWSER_QA !== "1")(
    "separates two Chromium contexts and their screenshot histories", async () => {
      const one = await prepare(a), two = await prepare(b);
      await one.page.setContent('<h1>Owner A synthetic</h1>');
      await two.page.setContent('<h1>Owner B synthetic</h1>');
      setBrowserWatch(a, true); setBrowserWatch(b, true);
      await captureBrowserWatch(a, one.page, "A private snapshot");
      await captureBrowserWatch(b, two.page, "B private snapshot");
      expect(browserWatchStatus(a)?.history).toHaveLength(1);
      expect(browserWatchStatus(b)?.history).toHaveLength(1);
      const imageA = browserWatchImage(a), imageB = browserWatchImage(b);
      expect(imageA).toBeInstanceOf(Buffer);
      expect(imageB).toBeInstanceOf(Buffer);
      expect(imageA!.equals(imageB!)).toBe(false);
      setBrowserWatch(a, false);
      expect(browserWatchImage(a)).toBeNull();
      expect(browserWatchImage(b)).toBeInstanceOf(Buffer);
      expect(await one.page.locator("h1").innerText()).toContain("Owner A");
      expect(await two.page.locator("h1").innerText()).toContain("Owner B");
    }, 30000);
});
