import { recentConversationTasks } from "./conversation-history";
import type { ProjectAgentTask } from "./types";

const MAX_TURNS = 8;
const MAX_REQUEST_CHARS = 600;
const MAX_RESULT_CHARS = 900;
const MAX_CHARS = 8_000;
const clean = (text: string, limit: number) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\s+/g, " ").trim().slice(0, limit);

/** Recent completed turns in the same chat, not other Project conversations or compact markers. */
export async function buildChatRecap(task: Pick<ProjectAgentTask, "id" | "projectId" | "ownerEmail" | "conversationId">): Promise<string> {
  const turns = await recentConversationTasks(task, (other) =>
    other.status === "done" && other.userPrompt !== "/compact" &&
    other.prompt !== "/compact" && Boolean(other.resultText?.trim()), MAX_TURNS);
  const lines = turns.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(turn => [
    "User: " + clean(turn.userPrompt ?? turn.prompt, MAX_REQUEST_CHARS),
    "You: " + clean(turn.resultText ?? "", MAX_RESULT_CHARS),
    turn.files?.length ? "Files made: " + clean(turn.files.map(file => file.name).join(", "), 200) : "",
  ].filter(Boolean).join("\n"));
  let result = lines.join("\n\n");
  while (result.length > MAX_CHARS && lines.length > 1) { lines.shift(); result = lines.join("\n\n"); }
  return result.slice(-MAX_CHARS);
}
