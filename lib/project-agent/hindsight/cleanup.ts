import { decodeProjectAgentTaskCursor } from "../task-pagination";
import { listProjectAgentTaskPage, readProjectAgentTask } from "../task-store";
import { deleteProjectHindsightTasks } from "./memory";
import { hindsightConfig } from "./transport";

/** Pre-delete all matching task documents before the Project/chat move or delete. */
export async function clearHindsightChatMemory(
  projectId: string, ownerEmail: string, key: { conversationId?: string; taskId?: string },
): Promise<void> {
  if (!hindsightConfig(true)) return;
  const original = key.taskId ? await readProjectAgentTask(key.taskId) : null;
  const conversationId = key.conversationId ?? (original?.projectId === projectId && original.ownerEmail === ownerEmail ? original.conversationId : undefined);
  const ids = new Set<string>();
  const visited = new Set<string>();
  let cursor: ReturnType<typeof decodeProjectAgentTaskCursor> = null;
  for (let pageIndex = 0; pageIndex < 5_000; pageIndex += 1) {
    const page = await listProjectAgentTaskPage([ownerEmail], projectId, 20, cursor ?? undefined);
    if (!Array.isArray(page.tasks) || (page.tasks.length === 0 && page.nextCursor))
      throw new Error("Cannot safely enumerate Hindsight memory: empty/invalid page");
    for (const task of page.tasks) {
      if (task.id === key.taskId || (conversationId && task.conversationId === conversationId)) ids.add(task.id);
    }
    if (!page.nextCursor) {
      await deleteProjectHindsightTasks(projectId, [...ids]);
      return;
    }
    if (visited.has(page.nextCursor)) throw new Error("Hindsight pagination cursor did not advance");
    visited.add(page.nextCursor);
    cursor = decodeProjectAgentTaskCursor(page.nextCursor);
    if (!cursor) throw new Error("Could not enumerate Hindsight documents for the chat");
  }
  throw new Error("Project chat history exceeded the safe 100,000-task scan limit");
}
