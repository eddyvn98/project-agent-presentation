/** Shared HTTP/MCP limits. Host access checks still run before task creation. */
export const PROJECT_AGENT_PROMPT_MAX_CHARS = 64_000;
export const PROJECT_AGENT_USER_PROMPT_MAX_CHARS = 12_000;

export function validateProjectAgentRequest(value: unknown): { error: string; status: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Task request must be an object", status: 400 };
  const body = value as Record<string, unknown>;
  if (typeof body.prompt !== "string" || !body.prompt.trim()) return { error: "prompt required", status: 400 };
  for (const [key, limit] of [["prompt", PROJECT_AGENT_PROMPT_MAX_CHARS], ["userPrompt", PROJECT_AGENT_USER_PROMPT_MAX_CHARS]] as const) {
    if (body[key] !== undefined && typeof body[key] !== "string") return { error: `${key} must be a string`, status: 400 };
    if (typeof body[key] === "string" && body[key].length > limit) return { error: `${key} is too long`, status: 413 };
  }
  for (const key of ["conversationId", "retryOfTaskId"]) {
    if (body[key] !== undefined && (typeof body[key] !== "string" || !body[key].trim() || body[key].length > 256)) return { error: `Invalid ${key}`, status: 400 };
  }
  // modelSelector is a legacy optional hint: the route ignores non-strings and
  // task-store normalizes empty, unknown or oversized strings to the default.
  if (body.goal !== undefined) {
    if (!body.goal || typeof body.goal !== "object" || Array.isArray(body.goal)) return { error: "Invalid goal", status: 400 };
    const goal = body.goal as Record<string, unknown>;
    if (typeof goal.objective !== "string" || !goal.objective.trim()) return { error: "Goal objective required", status: 400 };
    for (const key of ["objective", "condition"]) {
      if (goal[key] !== undefined && typeof goal[key] !== "string") return { error: `Invalid goal ${key}`, status: 400 };
      if (typeof goal[key] === "string" && goal[key].length > PROJECT_AGENT_USER_PROMPT_MAX_CHARS) return { error: `Goal ${key} is too long`, status: 413 };
    }
  }
  return null;
}
