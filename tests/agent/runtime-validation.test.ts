import { afterEach, expect, it, vi } from "vitest";
vi.mock("../../lib/project-agent/runtime/sandbox", () => ({ execInSandbox: vi.fn() }));
import { parseRuntimeAction, parseRuntimeActions } from "../../lib/project-agent/runtime/actions";
import { engineRefusal } from "../../lib/project-agent/runtime/engines";
import { runWait } from "../../lib/project-agent/runtime/wait-action";
afterEach(() => vi.useRealTimers());
it.each([
  { action: "shell", command: "echo test", timeout: -1 },
  { action: "shell", command: "echo test", timeout: Infinity },
  { action: "web_fetch", url: "https://example.com", offset: -1 },
  { action: "render", path: "outputs/demo.pdf", pages: [1, 0] },
  { action: "render", path: "outputs/demo.pdf", pages: [1.5] },
  { action: "generate_image", prompt: "Synthetic", count: 999 },
])("rejects invalid runtime parameters %j", (raw) => {
  expect(parseRuntimeAction(JSON.stringify(raw))).toHaveProperty("error");
});
it("rejects the batch before executing valid actions beside invalid ones", () => {
  expect(parseRuntimeActions('{"action":"shell","command":"echo test"}\n{"action":"render","path":"test.pdf","pages":[-2]}')).toHaveProperty("error");
});
it("preserves legacy engine behavior and denies MCP module actions", () => {
  expect(engineRefusal(undefined, "generate_image")).toBeNull();
  expect(engineRefusal([], "generate_image")).toContain("not available");
  expect(engineRefusal([], "shell")).toBeNull();
});
it("removes abort listeners after each completed wait and on cancellation", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const add = vi.spyOn(controller.signal, "addEventListener");
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  const running = runWait({ chatId: "synthetic", signal: controller.signal, waited: { seconds: 0 } }, { seconds: 10, every: 2 });
  await vi.advanceTimersByTimeAsync(4000);
  controller.abort();
  expect((await running).failed).toBe(true);
  expect(add.mock.calls.length).toBe(remove.mock.calls.length);
  expect(vi.getTimerCount()).toBe(0);
});
