/** A synthetic QA endpoint must never become a backdoor in employee deployments. */
export const P7_QA_PREFIX = "[P7_SYNTHETIC_QA]";
export const P7_PROJECT_PREFIX = "P7 QA Synthetic ";
export const P7_QA_DOMAIN = "@project-agent.test";
export interface P7QaContext {
  runtime: string | undefined; browser: string | undefined; fixture: string | undefined;
  nodeEnv: string | undefined; projectId: string; projectName: string;
  owner: string; origin: string | null; requestOrigin: string; expectedProjectId?: string;
}
export function p7QaAllowed(context: P7QaContext): boolean {
  if (context.nodeEnv === "production" || context.fixture !== "1" ||
      context.runtime !== "sandbox" || context.browser !== "1") return false;
  if (!context.owner.toLowerCase().endsWith(P7_QA_DOMAIN) ||
      !context.projectName.startsWith(P7_PROJECT_PREFIX)) return false;
  if (context.expectedProjectId && context.expectedProjectId !== context.projectId) return false;
  if (!context.origin || context.origin !== context.requestOrigin) return false;
  try {
    const url = new URL(context.requestOrigin);
    return url.protocol === "http:" && ["localhost","127.0.0.1","[::1]"].includes(url.hostname);
  } catch { return false; }
}
export function p7SyntheticTask(task: { prompt: string; projectId: string; ownerEmail: string },
 projectId: string, owner: string): boolean {
  return task.prompt.startsWith(P7_QA_PREFIX) && task.projectId === projectId &&
    task.ownerEmail.trim().toLowerCase() === owner.trim().toLowerCase();
}
