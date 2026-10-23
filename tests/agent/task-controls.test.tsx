import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { PublicProjectAgentTask } from "../../lib/project-agent/public-task";
import { useProjectAgentTaskControls } from "../../components/features/projects/useProjectAgentTaskControls";
const task = { id: "task-1", feedback: "like" } as PublicProjectAgentTask;
afterEach(() => vi.unstubAllGlobals());
it("reports failed stop requests without claiming success", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
  const error = vi.fn();
  const { result } = renderHook(() => useProjectAgentTaskControls("project-1", vi.fn(), error));
  let stopped = true;
  await act(async () => { stopped = await result.current.stopTask(task); });
  expect(stopped).toBe(false);
  expect(error).toHaveBeenCalledWith(expect.stringContaining("403"));
});
it("rolls back rejected optimistic feedback and locks concurrent writes", async () => {
  let finish!: (response: unknown) => void;
  const fetcher = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const { result } = renderHook(() => {
    const [tasks, setTasks] = useState([task]);
    return { tasks, ...useProjectAgentTaskControls("project-1", setTasks, vi.fn()) };
  });
  let pending!: Promise<void>;
  act(() => { pending = result.current.setFeedback(task, "dislike"); });
  expect(result.current.tasks[0].feedback).toBe("dislike");
  await act(async () => { await result.current.setFeedback(task, "like"); });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ ok: false, status: 500 }); await pending; });
  expect(result.current.tasks[0].feedback).toBe("like");
});
