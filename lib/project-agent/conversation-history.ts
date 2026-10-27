import { listProjectAgentTaskPage } from "./task-store";
import { decodeProjectAgentTaskCursor } from "./task-pagination";
import type { ProjectAgentTask } from "./types";

type Scope = Pick<ProjectAgentTask, "id" | "projectId" | "ownerEmail" | "conversationId">;
const PAGE_SIZE = 20;
const MAX_SCAN_PAGES = 6;

/** Bounded newest-first lookup, shared by recap, compaction and Dify ID recovery. */
export async function recentConversationTasks(
  scope: Scope, keep: (task: ProjectAgentTask) => boolean,
  limit = 8,
): Promise<ProjectAgentTask[]> {
  if (!scope.conversationId || limit < 1) return [];
  const results: ProjectAgentTask[] = [];
  let cursor: ReturnType<typeof decodeProjectAgentTaskCursor> = null;
  for (let pageIndex = 0; pageIndex < MAX_SCAN_PAGES && results.length < limit; pageIndex += 1) {
    const page = await listProjectAgentTaskPage([scope.ownerEmail], scope.projectId, PAGE_SIZE, cursor ?? undefined);
    for (const item of page.tasks) {
      if (item.id !== scope.id && item.conversationId === scope.conversationId && keep(item)) {
        results.push(item);
        if (results.length >= limit) break;
      }
    }
    if (!page.nextCursor) break;
    cursor = decodeProjectAgentTaskCursor(page.nextCursor);
    if (!cursor) break;
  }
  return results;
}
