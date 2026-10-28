import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/sandbox", () => ({
  execInSandbox: m.exec,
}));
import { MAX_TASK_WAIT_SECONDS, MAX_WAIT_SECONDS, parseWait, runWait }
  from "../../lib/project-agent/runtime/wait-action";

beforeEach(() => m.exec.mockReset());
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
describe("Runtime wait: budget, Stop, polling and timeout branches", () => {
  it("bounds and normalizes wait seconds and intervals", () => {
    expect(parseWait({ seconds: 999, every: 999, until: " test -e /work/result " }))
      .toEqual({ seconds: MAX_WAIT_SECONDS, every: 60,
        until: "test -e /work/result" });
    expect(parseWait({ seconds: "5", every: 1 }))
      .toEqual({ seconds: 5, every: 2, until: undefined });
    expect(parseWait({ seconds: 0 })).toHaveProperty("error");
    expect(parseWait({ seconds: "invalid" })).toHaveProperty("error");
  });
  it("refuses a wait if the cumulative budget is already spent", async () => {
    const waited = { seconds: MAX_TASK_WAIT_SECONDS };
    const result = await runWait({ chatId: "qa", waited },
      { seconds: 300, every: 2, until: "test -e /work/output" });
    expect(result).toMatchObject({ failed: true });
    expect(result.text).toContain("already waited");
    expect(m.exec).not.toHaveBeenCalled();
    expect(waited.seconds).toBe(MAX_TASK_WAIT_SECONDS);
  });
  it("returns immediately for successful read-only polling", async () => {
    m.exec.mockResolvedValueOnce({ output: "ready", exitCode: 0 });
    const result = await runWait({ chatId: "qa", readOnly: true,
      waited: { seconds: 0 } }, { seconds: 10, every: 2, until: "test -f result" });
    expect(result.text).toContain("Ready after");
    expect(result.failed).not.toBe(true);
    expect(m.exec).toHaveBeenCalledWith("qa", "test -f result", 20, true);
  });
  it.each([2, 126, 127])("fails fast for broken check command exit %i", async (exitCode) => {
    m.exec.mockResolvedValueOnce({ output: "synthetic command error", exitCode });
    const result = await runWait({ chatId: "qa", waited: { seconds: 0 } },
      { seconds: 15, every: 2, until: "synthetic-command" });
    expect(result).toMatchObject({ failed: true });
    expect(result.text).toContain("broken");
    expect(m.exec).toHaveBeenCalledOnce();
  });
  it("cancels in-flight wait after Stop without retaining timers", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const waited = { seconds: 0 };
    const running = runWait({ chatId: "qa", signal: controller.signal, waited },
      { seconds: 90, every: 5 });
    await vi.advanceTimersByTimeAsync(2000);
    controller.abort();
    const result = await running;
    expect(result).toMatchObject({ failed: true, text: "Wait stopped." });
    expect(vi.getTimerCount()).toBe(0);
    expect(waited.seconds).toBe(2);
    expect(m.exec).not.toHaveBeenCalled();
  });
  it("returns when next check succeeds, without spending full budget", async () => {
    vi.useFakeTimers();
    m.exec.mockResolvedValueOnce({ output: "pending", exitCode: 1 })
      .mockResolvedValueOnce({ output: "ready", exitCode: 0 });
    const waited = { seconds: 0 };
    const running = runWait({ chatId: "qa", waited },
      { seconds: 10, every: 2, until: "test -f /work/result" });
    await vi.advanceTimersByTimeAsync(2000);
    const result = await running;
    expect(result.text).toContain("Ready after 2 s.");
    expect(m.exec).toHaveBeenCalledTimes(2);
    expect(waited.seconds).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("stops at the remaining cumulative budget", async () => {
    vi.useFakeTimers();
    const waited = { seconds: MAX_TASK_WAIT_SECONDS - 3 };
    const running = runWait({ chatId: "qa", waited }, { seconds: 40, every: 5 });
    await vi.advanceTimersByTimeAsync(3000);
    expect((await running).text).toBe("Waited 3 s.");
    expect(waited.seconds).toBe(MAX_TASK_WAIT_SECONDS);
  });
});
