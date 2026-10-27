import { afterEach, describe, expect, it, vi } from "vitest";
import type { Page } from "playwright-core";
import {
  browserWatchStatus, browserWatchImage, captureBrowserWatch,
  setBrowserWatch, finishBrowserWatch, publicBrowserWatchLocation,
} from "../../lib/project-agent/runtime/browser-agent/watch";

const one = "pat_aaaaaa111111", two = "pat_bbbbbb222222";
function page(url = "https://site.example/private/account?access_token=hidden#secret",
  screenshot = vi.fn(async () => Buffer.alloc(90, 7))) {
  const locator = vi.fn(() => ({ syntheticMask: true }));
  return { value: { locator, url: () => url, screenshot } as unknown as Page, locator, screenshot };
}
afterEach(() => { setBrowserWatch(one, false); setBrowserWatch(two, false); });

describe("P0 Browser Watch privacy, isolation and bounded history", () => {
  it("never reveals URL paths, tokens or credentials in history", async () => {
    setBrowserWatch(one, true);
    const p = page();
    await captureBrowserWatch(one, p.value, "Read page", { x: 0.5, y: 0.25, kind: "agent" });
    const status = browserWatchStatus(one)!;
    expect(status).toMatchObject({ watching: true, sequence: 1, hasImage: true });
    expect(status.location).toBe("https://site.example");
    expect(status.history[0]).toMatchObject({ location: "https://site.example",
      marker: { x: 0.5, y: 0.25, kind: "agent" } });
    expect(JSON.stringify(status)).not.toMatch(/access_token|private\/account|hidden|secret/);
    expect(p.locator).toHaveBeenCalledWith(expect.stringContaining("[data-secret]"));
    expect(p.screenshot).toHaveBeenCalledWith(expect.objectContaining({
      type: "jpeg", mask: [{ syntheticMask: true }],
    }));
    for (const url of ["data:text/plain,token", "file:///etc/passwd", "invalid"])
      expect(publicBrowserWatchLocation(url)).toBe("");
  });

  it("separates two tasks and purges all frames when Watch is disabled", async () => {
    setBrowserWatch(one, true); setBrowserWatch(two, true);
    await captureBrowserWatch(one, page("https://one.example/private").value, "agent click");
    await captureBrowserWatch(two, page("https://two.example/private").value, "human click",
      { x: 1, y: 0, kind: "human" });
    expect(browserWatchStatus(one)?.location).toBe("https://one.example");
    expect(browserWatchStatus(two)?.location).toBe("https://two.example");
    const before = browserWatchImage(two);
    expect(before).toBeInstanceOf(Buffer);
    expect(browserWatchImage(one)).not.toBe(before);
    setBrowserWatch(one, false);
    expect(browserWatchStatus(one)).toBeNull();
    expect(browserWatchImage(one)).toBeNull();
    expect(browserWatchStatus(two)?.history[0].marker?.kind).toBe("human");
  });

  it("prevents in-flight screenshots from recreating history after Stop", async () => {
    let release!: (buffer: Buffer) => void;
    const screenshot = vi.fn(() => new Promise<Buffer>(r => { release = r; }));
    setBrowserWatch(one, true);
    const pending = captureBrowserWatch(one, page(undefined, screenshot).value, "slow frame");
    setBrowserWatch(one, false);
    release(Buffer.alloc(48, 3)); await pending;
    expect(browserWatchStatus(one)).toBeNull();
    setBrowserWatch(one, true);
    expect(browserWatchStatus(one)?.sequence).toBe(0);
  });

  it("bounds screenshot history at 12 steps and rejects oversized frames", async () => {
    setBrowserWatch(one, true);
    const p = page();
    for (let i = 0; i < 19; i++) await captureBrowserWatch(one, p.value, "snapshot-" + i);
    expect(browserWatchStatus(one)?.history).toHaveLength(12);
    expect(browserWatchStatus(one)?.history[0].sequence).toBe(8);
    expect(browserWatchImage(one, 1)).toBeNull();
    const huge = page("https://safe.example/", vi.fn(async () => Buffer.alloc(750_001)));
    await captureBrowserWatch(one, huge.value, "oversized");
    expect(browserWatchStatus(one)?.sequence).toBe(19);
  });

  it("keeps terminal frames read-only and ignores screenshot failures", async () => {
    setBrowserWatch(one, true);
    const broken = page("https://safe.example", vi.fn(async () => { throw Error("Disconnected"); }));
    await expect(captureBrowserWatch(one, broken.value, "failed")).resolves.toBeUndefined();
    expect(browserWatchStatus(one)?.sequence).toBe(0);
    await captureBrowserWatch(one, page().value, "final");
    finishBrowserWatch(one);
    await captureBrowserWatch(one, page().value, "should not appear");
    expect(browserWatchStatus(one)).toMatchObject({ sequence: 1, finished: true });
  });
});
