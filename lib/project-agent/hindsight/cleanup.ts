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
  const ids: string[] = [];
  let cursor: ReturnType<typeof decodeProjectAgentTaskCursor> = null;
  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    const page = await listProjectAgentTaskPage([ownerEmail], projectId, 20, cursor ?? undefined);
    for (const task of page.tasks) {
      if (task.id === key.taskId || (conversationId && task.conversationId === conversationId)) ids.push(task.id);
    }
    if (!page.nextCursor) {
      await deleteProjectHindsightTasks(projectId, ids);
      return;
    }
    cursor = decodeProjectAgentTaskCursor(page.nextCursor);
    if (!cursor) throw new Error("Could not enumerate Hindsight documents for the chat");
  }
  throw new Error("Project chat history is too large to safely purge Hindsight memories");
}
