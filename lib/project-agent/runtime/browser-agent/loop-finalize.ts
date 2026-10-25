import type { RuntimeStep } from "../run-agent-types";
import { browserLoopEnabled, browserLoopStatus, closeBrowserLoop } from "./loop-state";

/** Append-only safe summary for the existing task log and account metrics. */
export function finalizeP8BrowserLoop(taskId: string | undefined,
  notify?: (step: RuntimeStep) => void): void {
  if (!taskId || !browserLoopEnabled()) return;
  closeBrowserLoop(taskId);
  const state = browserLoopStatus(taskId);
  if (!state) return;
  notify?.({ tool: "p8_loop_metrics",
    detail: "actions=" + state.actions + " verified=" + state.verified +
      " unverified=" + state.unverified + " failed=" + state.failed +
      " blocked=" + state.blocked + " interventions=" + state.interventions });
}
