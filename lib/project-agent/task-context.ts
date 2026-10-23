import { listProjectConversationMembers } from "@/lib/capabilities/project-sharing";
import { listProjectAgentTaskPage, listProjectAgentTasks } from "./task-store";
import { decodeProjectAgentTaskCursor } from "./task-pagination";
import { rankRelevantHistory } from "./context-relevance";

const MAX_TASKS = 8;
const MAX_TASK_CONTEXT_CHARS = 16_000;
const MAX_REQUEST_CHARS = 500;
const MAX_RESULT_CHARS = 900;

function escapeContext(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
}

export async function loadProjectAgentTaskContext(
  projectId: string,
  callerEmail: string,
  currentTaskId: string,
  query = "",
): Promise<string> {
  const members = await listProjectConversationMembers(projectId, callerEmail);
  if (!members) return "";
  let tasks: Awaited<ReturnType<typeof listProjectAgentTasks>>;
  if (!query.trim()) {
    tasks = await listProjectAgentTasks(members, projectId, 20);
  } else {
    tasks = [];
    let cursor: ReturnType<typeof decodeProjectAgentTaskCursor> = null;
    for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
      const page = await listProjectAgentTaskPage(members, projectId, 20, cursor ?? undefined);
      tasks.push(...page.tasks);
      cursor = decodeProjectAgentTaskCursor(page.nextCursor ?? null);
      if (!cursor) break;
    }
  }
  const previous = rankRelevantHistory(
    tasks.filter((task) => task.id !== currentTaskId && task.status === "done" && task.resultText?.trim()),
    query.slice(0, 4_000),
    (task) => `${task.userPrompt ?? task.prompt}\n${task.resultText ?? ""}`,
    MAX_TASKS,
  );
  return previous.map((task) => [
    `Earlier Project Agent request: ${escapeContext(task.userPrompt ?? task.prompt).slice(0, MAX_REQUEST_CHARS)}`,
    `Recorded result: ${escapeContext(task.resultText ?? "").slice(0, MAX_RESULT_CHARS)}`,
    task.files?.length ? `Generated files: ${task.files.map((file) => escapeContext(file.name)).join(", ").slice(0, 200)}` : "",
  ].filter(Boolean).join("\n")).join("\n\n---\n\n").slice(0, MAX_TASK_CONTEXT_CHARS);
}
