import type { RuntimeStep } from "../run-agent-types";
import { updateProjectAgentTask } from "../../task-store";
import { browserLoopEnabled, browserLoopStatus, closeBrowserLoop } from "./loop-state";

/** One bounded numeric receipt persists after browser context shutdown. */
export async function finalizeP8BrowserLoop(taskId: string | undefined,
  notify?: (step: RuntimeStep) => void): Promise<void> {
  if (!taskId || !browserLoopEnabled()) return;
  closeBrowserLoop(taskId);
  const state = browserLoopStatus(taskId);
  if (!state) return;
  const detail = "actions=" + state.actions + " verified=" + state.verified +
    " unverified=" + state.unverified + " failed=" + state.failed +
    " blocked=" + state.blocked + " interventions=" + state.interventions;
  notify?.({ tool: "p8_loop_metrics", detail });
  // Auditable even after the process-local Watch/ledger expires. No page content.
  await updateProjectAgentTask(taskId, { logLine: "p8_loop_metrics :: " + detail })
    .catch(() => {}); // Telemetry must not turn a finished task into an error.
}
