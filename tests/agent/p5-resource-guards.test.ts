import { describe, expect, it, vi, afterEach } from "vitest";
import { BrowserSlotPool } from "../../lib/project-agent/runtime/browser-agent/slot-pool";
import { estimatedModelCost, enforceTaskBudget } from "../../lib/project-agent/runtime/usage-pricing";
afterEach(() => vi.unstubAllEnvs());

describe("P5 bounded browser admission", () => {
  it("caps concurrency, transfers fairly and releases only once", async () => {
    const pool = new BrowserSlotPool(1, 5000);
    const first = await pool.acquire();
    const order: number[] = [];
    const second = pool.acquire().then(release => { order.push(2); return release; });
    const third = pool.acquire().then(release => { order.push(3); return release; });
    expect(pool.active).toBe(1);
    expect(pool.waiting).toBe(2);
    first(); first();
    const next = await second;
    expect(order).toEqual([2]);
    expect(pool.active).toBe(1);
    next();
    const final = await third;
    expect(order).toEqual([2, 3]);
    final();
    expect(pool.active).toBe(0);
    expect(pool.waiting).toBe(0);
  });
  it("removes cancelled waiters without granting context capacity", async () => {
    const pool = new BrowserSlotPool(1);
    const first = await pool.acquire();
    const controller = new AbortController();
    const pending = pool.acquire(controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/stopped/);
    expect(pool.waiting).toBe(0);
    first();
    expect(pool.active).toBe(0);
  });
  it("times out blocked admission and permits later tasks", async () => {
    const pool = new BrowserSlotPool(1, 20);
    const first = await pool.acquire();
    await expect(pool.acquire()).rejects.toThrow(/timed out/);
    first();
    const second = await pool.acquire();
    second();
    expect(pool.active).toBe(0);
  });
});

describe("P5 strict cost enforcement", () => {
  it("does not represent nonfinite token usage as a known cost", () => {
    vi.stubEnv("PROJECT_AGENT_MODEL_PRICING_JSON",
      JSON.stringify({ basic: { inputPerMillion: 1, outputPerMillion: 2 } }));
    expect(estimatedModelCost("basic", Number.NaN, 5)).toBeNull();
    expect(estimatedModelCost("basic", -1, 5)).toBeNull();
    expect(() => enforceTaskBudget(-1, 4, "basic")).toThrow(/Invalid model token/);
  });
  it("preserves legacy unknown-cost behavior unless strict mode is enabled", () => {
    vi.stubEnv("PROJECT_AGENT_TASK_MAX_COST_USD", "0.01");
    expect(() => enforceTaskBudget(100, 10, "unknown")).not.toThrow();
    vi.stubEnv("PROJECT_AGENT_STRICT_COST_BUDGET", "1");
    expect(() => enforceTaskBudget(100, 10, "unknown")).toThrow(/pricing is unknown/);
  });
});
