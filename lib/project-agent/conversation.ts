import { recentConversationTasks } from "./conversation-history";
import type { ProjectAgentTask } from "./types";

/** Map the stable chat id to the most recent underlying Dify id, including after compactions.
 * A bounded cursor scan handles interleaved Project conversations beyond the latest 20 tasks.
 */
export async function resolveDifyConversationId(task: Pick<ProjectAgentTask,
  "id" | "projectId" | "ownerEmail" | "conversationId" | "difyConversationId">): Promise<string | undefined> {
  if (!task.conversationId) return undefined;
  if (task.difyConversationId) return task.difyConversationId;
  const [latest] = await recentConversationTasks(task, other => Boolean(other.difyConversationId), 1).catch(() => []);
  return latest?.difyConversationId ??
    (task.conversationId.startsWith("pat_") ? undefined : task.conversationId);
}
