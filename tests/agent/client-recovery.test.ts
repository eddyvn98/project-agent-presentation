import { describe, expect, it, vi } from "vitest";
import { runProjectAgentTaskFromClient } from "../../lib/project-agent/client";
import { waitForTaskPoll } from "../../lib/project-agent/client-poll";
const task = { id: "task-1", projectId: "project-1", prompt: "Synthetic request", status: "running", createdAt: "", updatedAt: "", canContinue: true };
const response = (status: number, value: unknown = task) => ({ ok: status < 400, status, json: async () => ({ task: value }) });
const input = { projectId: "project-1", prompt: "Synthetic request", conversationId: null, pollIntervalMs: 0 };

describe("task observation recovery", () => {
  it.each([408, 429, 500, 502, 503, 504])("retries %i reads without creating again", async (status) => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(202)).mockResolvedValueOnce(response(status)).mockResolvedValueOnce(response(200, { ...task, status: "done" }));
    expect((await runProjectAgentTaskFromClient({ ...input, fetcher })).status).toBe("done");
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("bounds retries and never retries permission failures", async () => {
    for (const [status, calls] of [[503, 4], [403, 2], [404, 2]]) {
      const fetcher = vi.fn().mockResolvedValueOnce(response(202)).mockResolvedValue(response(status));
      await expect(runProjectAgentTaskFromClient({ ...input, fetcher })).rejects.toThrow(String(status));
      expect(fetcher).toHaveBeenCalledTimes(calls);
    }
  });
  it("never retries an ambiguous creation failure", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(runProjectAgentTaskFromClient({ ...input, fetcher })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([null, {}, { ...task, status: "unknown" }])("rejects malformed response %j", async (value) => {
    await expect(runProjectAgentTaskFromClient({ ...input, fetcher: async () => response(202, value) })).rejects.toThrow();
  });
  it("rejects task identity drift before publishing progress", async () => {
    const onProgress = vi.fn();
    const fetcher = vi.fn().mockResolvedValueOnce(response(202)).mockResolvedValueOnce(response(200, { ...task, id: "other" }));
    await expect(runProjectAgentTaskFromClient({ ...input, fetcher, onProgress })).rejects.toThrow("Unexpected");
    expect(onProgress).toHaveBeenCalledTimes(1);
  });
  it("stops observation promptly without issuing a server cancellation", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValue(response(202));
    await expect(runProjectAgentTaskFromClient({ ...input, pollIntervalMs: 60_000, signal: controller.signal, fetcher, onProgress: () => controller.abort() })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(waitForTaskPoll(1000, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
