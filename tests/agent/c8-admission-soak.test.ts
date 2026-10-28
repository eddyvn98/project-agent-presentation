import { describe, expect, it } from "vitest";
import { BrowserSlotPool } from "../../lib/project-agent/runtime/browser-agent/slot-pool";

describe("C8 bounded browser admission sustained cycles", () => {
  it("reuses three slots over 600 operations without capacity or waiter leaks", async () => {
    const pool = new BrowserSlotPool(3, 5000);
    let max = 0, acquired = 0;
    for (let round = 0; round < 100; round++) {
      const first = await Promise.all(Array.from({ length: 3 }, () => pool.acquire()));
      const pending = Array.from({ length: 3 }, () => pool.acquire());
      const done = pending.map(p => p.then(release => {
        acquired++; max = Math.max(max, pool.active);
        release(); release();
      }));
      expect(pool.active).toBe(3);
      expect(pool.waiting).toBe(3);
      first.forEach(release => { release(); release(); });
      await Promise.all(done);
      acquired += 3;
      expect(pool.active).toBe(0);
      expect(pool.waiting).toBe(0);
    }
    expect(max).toBeLessThanOrEqual(3);
    expect(acquired).toBe(600);
  });
  it("clears aborted queued sessions without leaking slots over 100 Stop cycles", async () => {
    const pool = new BrowserSlotPool(1, 5000);
    const held = await pool.acquire();
    let stopped = 0;
    for (let i = 0; i < 100; i++) {
      const signal = new AbortController();
      const awaiting = pool.acquire(signal.signal);
      signal.abort(new Error("Stop"));
      await expect(awaiting).rejects.toThrow(/stopped/i);
      stopped++;
      expect(pool.waiting).toBe(0);
      expect(pool.active).toBe(1);
    }
    held(); held();
    const renewed = await pool.acquire();
    renewed();
    expect(stopped).toBe(100);
    expect(pool.active).toBe(0);
    expect(pool.waiting).toBe(0);
  });
});
