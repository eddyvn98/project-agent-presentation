const tasks = new Map<string, any>();
export async function findProjectAgentTask(id: string) { return tasks.get(id) || null; }
export async function findProjectAgentTaskByWorkspaceTurn(_projectId: string, _turnId: string) { return null; }
export async function listProjectAgentTasks(projectId: string, ownerEmail: string, limit = 20, _cursor?: any) {
  const list = Array.from(tasks.values()).filter(t => t.projectId === projectId && t.ownerEmail === ownerEmail);
  return { items: list.slice(0, limit), nextCursor: null, hasMore: false };
}
export async function patchProjectAgentTask(id: string, patch: any, logLine?: string) {
  const current = tasks.get(id) || { id };
  const next = { ...current, ...patch };
  if (logLine) next.log = [...(next.log || []), logLine];
  tasks.set(id, next);
  return next;
}
export async function saveProjectAgentTask(task: any) { tasks.set(task.id, task); return task; }
export async function deleteProjectAgentConversation(projectId: string, ownerEmail: string, key: string) {
  const ids: string[] = [];
  for (const [id, t] of tasks) {
    if (t.projectId === projectId && t.ownerEmail === ownerEmail && (t.conversationKey === key || t.clientConversationId === key)) {
      ids.push(id);
      tasks.delete(id);
    }
  }
  return ids;
}
