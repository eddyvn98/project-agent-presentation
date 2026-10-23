export function buildProjectAgentTaskUrl(
  projectId: string,
  taskId: string,
): string {
  return `/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(taskId)}`;
}
