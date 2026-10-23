"use client";
import { useRef, type Dispatch, type SetStateAction } from "react";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";

/** Persist task controls before reporting success; revert optimistic feedback on rejection. */
export function useProjectAgentTaskControls(projectId: string | null, setTasks: Dispatch<SetStateAction<PublicProjectAgentTask[]>>, setError: (message: string) => void) {
  const pending = useRef(new Set<string>());
  async function stopTask(task: PublicProjectAgentTask): Promise<boolean> {
    if (!projectId || pending.current.has(`stop:${task.id}`)) return false;
    pending.current.add(`stop:${task.id}`);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(task.id)}/stop`, { method: "POST" });
      if (!response.ok) throw new Error(`Could not stop this task (${response.status}).`);
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not stop this task. Check your connection."); return false; }
    finally { pending.current.delete(`stop:${task.id}`); }
  }
  async function setFeedback(task: PublicProjectAgentTask, feedback: "like" | "dislike") {
    const key = `feedback:${task.id}`;
    if (!projectId || pending.current.has(key)) return;
    pending.current.add(key);
    const next = task.feedback === feedback ? undefined : feedback;
    const patch = (value: typeof next) => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, feedback: value } : item));
    patch(next);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(task.id)}/feedback`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback: next ?? null }) });
      if (!response.ok) throw new Error(`Could not save your feedback (${response.status}).`);
    } catch (cause) { patch(task.feedback); setError(cause instanceof Error ? cause.message : "Could not save your feedback."); }
    finally { pending.current.delete(key); }
  }
  return { stopTask, setFeedback };
}
