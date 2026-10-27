import { afterEach, describe, expect, it, vi } from "vitest";
import type { Page } from "playwright-core";
import { browserWatchImage, browserWatchStatus, captureBrowserWatch, finishBrowserWatch,
  setBrowserWatch } from "../../lib/project-agent/runtime/browser-agent/watch";

const ids = Array.from({ length: 24 }, (_, i) => "pat_" + i.toString(16).padStart(12, "0"));
const page = (i = 0) => ({
  locator: vi.fn(() => ({ syntheticMask: true })),
  screenshot: vi.fn(async () => Buffer.alloc(20_000, i % 255)),
  url: () => "https://safe.example.test/private?access_token=synthetic-secret",
}) as unknown as Page;
afterEach(() => ids.forEach(id => setBrowserWatch(id, false)));

describe("C9 Watch frame memory and cleanup under repeated users", () => {
  it("retains at most 16 opt-in tasks and 12 frames per task with no private URL paths", async () => {
    for (let i = 0; i < ids.length; i++) {
      setBrowserWatch(ids[i], true);
      const p = page(i);
      for (let n = 0; n < 20; n++)
        await captureBrowserWatch(ids[i], p, "snapshot-" + n);
    }
    expect(ids.filter(id => browserWatchStatus(id))).toHaveLength(16);
    for (const id of ids.slice(-16)) {
      const status = browserWatchStatus(id)!;
      expect(status.history).toHaveLength(12);
      expect(status.history[0].sequence).toBe(9);
      expect(status.location).toBe("https://safe.example.test");
      expect(JSON.stringify(status)).not.toMatch(/access_token|private\?|synthetic-secret/);
      expect(browserWatchImage(id)).toBeInstanceOf(Buffer);
    }
    ids.forEach(id => setBrowserWatch(id, false));
    expect(ids.every(id => browserWatchImage(id) === null)).toBe(true);
  });
  it("does not resurrect a revoked Watch when delayed screenshot completes", async () => {
    let resolve!: (image: Buffer) => void;
    const delayed = {
      locator: () => ({ syntheticMask: true }),
      url: () => "https://safe.example.test",
      screenshot: () => new Promise<Buffer>(done => { resolve = done; }),
    } as unknown as Page;
    setBrowserWatch(ids[0], true);
    const capture = captureBrowserWatch(ids[0], delayed, "stale");
    setBrowserWatch(ids[0], false);
    setBrowserWatch(ids[0], true);
    resolve(Buffer.alloc(80, 1));
    await capture;
    expect(browserWatchStatus(ids[0])?.history).toHaveLength(0);
    await captureBrowserWatch(ids[0], page(), "new");
    finishBrowserWatch(ids[0]);
    await captureBrowserWatch(ids[0], page(), "post-finish");
    expect(browserWatchStatus(ids[0])?.history).toHaveLength(1);
  });
});
