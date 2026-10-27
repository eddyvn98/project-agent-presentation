import { COMPACT_SUGGEST_RATIO, contextRatio } from "./context-meter";
import { recentConversationTasks } from "./conversation-history";
import { updateProjectAgentTask } from "./task-store";
import type { ProjectAgentTask } from "./types";
import { withCompactionLease } from "./compact-lease";

/** Compact a completed predecessor when its last prompt approached the context window.
 * Never change a queued task to running: only markTaskRunningIfQueued owns that CAS transition.
 */
export async function autoCompactIfNeeded(task: ProjectAgentTask): Promise<string | undefined> {
  if (!task.conversationId) return undefined;
  try {
    const [last] = await recentConversationTasks(task, other => other.status === "done", 1);
    if (!last?.contextTokens || contextRatio(last.contextTokens) < COMPACT_SUGGEST_RATIO) return undefined;
    await updateProjectAgentTask(task.id, { logLine: "auto-compacting conversation" });
    const { compactChat } = await import("./compact");
    return await withCompactionLease(task, last.id,
      async () => (await compactChat(last)).difyConversationId);
  } catch {
    return undefined;
  }
}
