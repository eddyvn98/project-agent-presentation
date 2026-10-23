import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../../components/features/projects/useProjectAgentChatActions", () => ({ PROJECT_AGENT_CHATS_CHANGED: "test-chats-changed" }));
import { useProjectAgentConversations } from "../../components/features/projects/useProjectAgentConversations";
afterEach(() => vi.unstubAllGlobals());
const task = (projectId: string) => ({ id: projectId, projectId, prompt: projectId, createdAt: "2026-01-01", updatedAt: "2026-01-01" });
it("ignores an old project response even when the transport ignores abort", async () => {
  let resolveOld!: (value: unknown) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValue({ ok: true, json: async () => ({ tasks: [task("new")] }) });
  vi.stubGlobal("fetch", fetcher);
  const { result, rerender } = renderHook(({ id }) => useProjectAgentConversations(id), { initialProps: { id: "old" } });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  rerender({ id: "new" });
  await waitFor(() => expect(result.current.conversations[0]?.title).toBe("new"));
  await act(async () => resolveOld({ ok: true, json: async () => ({ tasks: [task("old")] }) }));
  expect(result.current.conversations[0].title).toBe("new");
});
it("exposes load errors, retries and resets on deselection", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 403 }).mockResolvedValue({ ok: true, json: async () => ({ tasks: [task("p")] }) });
  vi.stubGlobal("fetch", fetcher);
  const { result, rerender } = renderHook(({ id }: { id: string | null }) => useProjectAgentConversations(id), { initialProps: { id: "p" as string | null } });
  await waitFor(() => expect(result.current.error).toContain("403"));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.conversations).toHaveLength(1));
  expect(result.current.error).toBe("");
  rerender({ id: null });
  expect(result.current.conversations).toHaveLength(0);
  expect(result.current.loading).toBe(false);
});
