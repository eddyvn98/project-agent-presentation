import { projectBrowserKey } from "./project-sessions";
import { renewProjectAgent } from "./project-control-db";

/** Stop-aware lease refresh for long model turns; never grants ownership to a different task. */
export function keepProjectAgentLease(input: {
  projectId?: string; ownerEmail?: string; taskId?: string; signal?: AbortSignal;
}): () => void {
  if (process.env.PROJECT_AGENT_STEEL_BROWSER !== "1" ||
      !input.projectId || !input.ownerEmail || !input.taskId)
    return () => {};
  const scope = projectBrowserKey(input.projectId, input.ownerEmail);
  const taskId = input.taskId;
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running || input.signal?.aborted) return;
    running = true;
    try { await renewProjectAgent(scope, taskId); }
    catch { /* The next browser action must fail closed if Mongo is unavailable. */ }
    finally { running = false; }
  };
  const timer = setInterval(() => { void tick(); }, 20_000);
  timer.unref?.();
  const stop = () => { stopped = true; clearInterval(timer); };
  input.signal?.addEventListener("abort", stop, { once: true });
  return () => { stop(); input.signal?.removeEventListener("abort", stop); };
}
