import { decodeProjectAgentTaskCursor } from "./task-pagination";
import { listProjectAgentTaskPage } from "./task-store";
import type { ProjectAgentTask } from "./types";

const MAX_TURNS = 8;
const MAX_SCAN_PAGES = 6;
const MAX_REQUEST_CHARS = 600;
const MAX_RESULT_CHARS = 900;
const MAX_CHARS = 8_000;

const clean = (text: string, limit: number) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\s+/g, " ").trim().slice(0, limit);

/** Recover latest completed turns from this chat, even when other chats interleave in the task list. */
export async function buildChatRecap(task: Pick<ProjectAgentTask, "id" | "projectId" | "ownerEmail" | "conversationId">): Promise<string> {
  if (!task.conversationId) return "";
  const turns: ProjectAgentTask[] = [];
  let cursor: ReturnType<typeof decodeProjectAgentTaskCursor> = null;
  for (let page = 0; page < MAX_SCAN_PAGES && turns.length < MAX_TURNS; page += 1) {
    const result = await listProjectAgentTaskPage([task.ownerEmail], task.projectId, 20, cursor ?? undefined);
    turns.push(...result.tasks.filter(other =>
      other.id !== task.id && other.conversationId === task.conversationId &&
      other.status === "done" && other.userPrompt !== "/compact" && other.prompt !== "/compact" &&
      Boolean(other.resultText?.trim()),
    ));
    cursor = decodeProjectAgentTaskCursor(result.nextCursor ?? null);
    if (!cursor) break;
  }
  const lines = turns.slice(0, MAX_TURNS).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(turn => [
    "User: " + clean(turn.userPrompt ?? turn.prompt, MAX_REQUEST_CHARS),
    "You: " + clean(turn.resultText ?? "", MAX_RESULT_CHARS),
    turn.files?.length ? "Files made: " + clean(turn.files.map(file => file.name).join(", "), 200) : "",
  ].filter(Boolean).join("\n"));
  let result = lines.join("\n\n");
  while (result.length > MAX_CHARS && lines.length > 1) { lines.shift(); result = lines.join("\n\n"); }
  return result.slice(-MAX_CHARS);
}
