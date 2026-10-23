import { act, renderHook } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../../lib/project-agent/client", () => ({ runProjectAgentTaskFromClient: vi.fn() }));
vi.mock("@/stores/useAgentComposerStore", () => ({ composerDirective: () => "", composerModelSelector: () => undefined }));
import { runProjectAgentTaskFromClient } from "../../lib/project-agent/client";
import { useProjectAgentSubmit } from "../../components/features/projects/useProjectAgentSubmit";
const event = () => ({ preventDefault: vi.fn() }) as unknown as FormEvent<HTMLFormElement>;
function options() {
  return { projectId: "project-1", viewId: "chat-1", orderedTasks: [{ id: "task-1", conversationId: "chat-1" }], draft: "Synthetic request", pendingFiles: [], filesToSave: new Set(), quotes: [], activeFileContext: null, busy: false,
    queue: { enqueue: vi.fn() }, addKnowledgeFile: vi.fn(), initialPromptRef: { current: null }, regeneratePromptRef: { current: null }, shouldFollowRef: { current: false },
    setBusy: vi.fn(), setOutgoing: vi.fn(), setDraft: vi.fn(), setError: vi.fn(), setFilesToSave: vi.fn(), setPendingFiles: vi.fn(), setQuotes: vi.fn(), setTasks: vi.fn(), onCompacted: vi.fn() } as unknown as Parameters<typeof useProjectAgentSubmit>[0];
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("locks synchronously before React has time to render busy state", async () => {
  let finish!: () => void;
  vi.mocked(runProjectAgentTaskFromClient).mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve({ status: "done" } as never); }));
  const input = options();
  const { result } = renderHook(() => useProjectAgentSubmit(input));
  let first!: Promise<void>;
  act(() => { first = result.current(event()); });
  await act(async () => { await result.current(event()); });
  expect(runProjectAgentTaskFromClient).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); await first; });
  expect(input.setBusy).toHaveBeenLastCalledWith(false);
});
it("preserves a failed goal command and surfaces permission failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
  const input = { ...options(), draft: "/goal pause" };
  const { result } = renderHook(() => useProjectAgentSubmit(input));
  await act(async () => { await result.current(event()); });
  expect(input.setError).toHaveBeenCalledWith(expect.stringContaining("403"));
  expect(input.setDraft).not.toHaveBeenCalled();
  expect(runProjectAgentTaskFromClient).not.toHaveBeenCalled();
});
it("restores unsent attachments after task creation failure", async () => {
  vi.mocked(runProjectAgentTaskFromClient).mockRejectedValueOnce(new Error("Service unavailable"));
  const file = new File(["test"], "synthetic.txt");
  const input = { ...options(), pendingFiles: [file] };
  const { result } = renderHook(() => useProjectAgentSubmit(input));
  await act(async () => { await result.current(event()); });
  expect(input.setPendingFiles).toHaveBeenLastCalledWith([file]);
  expect(input.setDraft).toHaveBeenLastCalledWith("Synthetic request");
  expect(input.setError).toHaveBeenCalledWith("Service unavailable");
});
it("still queues messages after the busy state renders during an active submission", async () => {
  let finish!: () => void;
  vi.mocked(runProjectAgentTaskFromClient).mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve({ status: "done" } as never); }));
  const input = options();
  const { result, rerender } = renderHook(({ busy, draft }) => useProjectAgentSubmit({ ...input, busy, draft }), { initialProps: { busy: false, draft: "First request" } });
  let first!: Promise<void>;
  act(() => { first = result.current(event()); });
  rerender({ busy: true, draft: "Follow-up request" });
  await act(async () => { await result.current(event()); });
  expect(input.queue.enqueue).toHaveBeenCalledWith("Follow-up request", []);
  expect(runProjectAgentTaskFromClient).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); await first; });
});
