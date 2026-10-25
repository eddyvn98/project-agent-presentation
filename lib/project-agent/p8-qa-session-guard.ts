import { p7QaAllowed, p7SyntheticTask, type P7QaContext, P7_QA_PREFIX } from "./p7-qa-guard";

export const P8_QA_PROMPT = `${P7_QA_PREFIX} p8 browser fixture - local synthetic data only`;
export const P8_QA_OPERATIONS = new Set(["qa_prepare", "qa_probe", "qa_step", "qa_cleanup"]);
/** Extra gate for active Chromium QA: must run on a dedicated localhost origin. */
export function p8QaSessionAllowed(
  context: P7QaContext, task: { prompt: string; projectId: string; ownerEmail: string;
    status: string; cancelled?: boolean },
  config: { enabled?: string; loop?: string; isolated?: string; allowedOrigin?: string },
): boolean {
  if (config.enabled !== "1" || config.loop !== "1" || config.isolated !== "1" ||
      context.requestOrigin !== config.allowedOrigin || !p7QaAllowed(context)) return false;
  if (!p7SyntheticTask(task, context.projectId, context.owner) ||
      task.prompt !== P8_QA_PROMPT || task.status !== "running" || task.cancelled) return false;
  try {
    const url = new URL(context.requestOrigin);
    return url.protocol === "http:" && ["3005", "3006"].includes(url.port) &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch { return false; }
}
