import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useProjectAgentConversationSync } from "../../components/features/projects/useProjectAgentConversationSync";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const data = { tasks: [{ id: "task-1", projectId: "project-1", conversationId: "chat-1" }] };
const ok = () => ({ ok: true, text: async () => JSON.stringify(data) });
it("keeps one request in flight and aborts it when changing view", async () => {
  vi.useFakeTimers();
  let finish!: (response: unknown) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue(ok());
  vi.stubGlobal("fetch", fetcher);
  const setTasks = vi.fn(), setView = vi.fn(), setError = vi.fn();
  const { rerender } = renderHook(({ view }) => useProjectAgentConversationSync("project-1", view, setTasks, setView, setError), { initialProps: { view: "old-chat" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
  expect(fetcher).toHaveBeenCalledTimes(1);
  rerender({ view: "chat-1" });
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => { finish(ok()); });
  expect(setTasks).toHaveBeenLastCalledWith(data.tasks);
});
it("clears refresh errors even when recovered JSON is identical", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValueOnce(ok()).mockResolvedValueOnce({ ok: false }).mockResolvedValue(ok());
  vi.stubGlobal("fetch", fetcher);
  const setTasks = vi.fn(), setView = vi.fn(), setError = vi.fn();
  renderHook(() => useProjectAgentConversationSync("project-1", "chat-1", setTasks, setView, setError));
  await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(setError).toHaveBeenLastCalledWith("Could not load this Project Agent chat");
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(setError).toHaveBeenLastCalledWith("");
  expect(setTasks).toHaveBeenCalledTimes(2); // scope reset and first successful payload
});
