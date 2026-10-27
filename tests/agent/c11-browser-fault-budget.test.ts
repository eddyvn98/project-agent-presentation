import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserSlotPool } from "../../lib/project-agent/runtime/browser-agent/slot-pool";
import { setBrowserWatch, browserWatchStatus, captureBrowserWatch,
  browserWatchImage } from "../../lib/project-agent/runtime/browser-agent/watch";

const id = "pat_abcdef987654";
afterEach(() => setBrowserWatch(id, false));
describe("C11 fail-closed browser faults and resource invariants", () => {
  it("isolates a capacity timeout from a following healthy browser request", async () => {
    const slots = new BrowserSlotPool(1, 15);
    const held = await slots.acquire();
    await expect(slots.acquire()).rejects.toThrow(/timed out/i);
    expect(slots.waiting).toBe(0);
    held();
    const next = await slots.acquire();
    expect(slots.active).toBe(1);
    next(); next();
    expect(slots.active).toBe(0);
  });
  it("never persists oversized screenshots or exceptions in Watch state", async () => {
    setBrowserWatch(id, true);
    const p = { locator: vi.fn(() => ({ syntheticMask: true })),
      url: () => "https://safe.example.test/secret?token=synthetic",
      screenshot: vi.fn(async () => Buffer.alloc(750_001)) };
    for (let i = 0; i < 12; i++)
      await captureBrowserWatch(id, p as never, "oversize");
    expect(browserWatchStatus(id)?.history).toHaveLength(0);
    expect(browserWatchImage(id)).toBeNull();
    p.screenshot.mockImplementation(async () => { throw Error("Browser disconnected"); });
    await expect(captureBrowserWatch(id, p as never, "fault")).resolves.toBeUndefined();
    expect(browserWatchStatus(id)?.history).toHaveLength(0);
    expect(browserWatchStatus(id)?.location).not.toContain("token");
  });
});
