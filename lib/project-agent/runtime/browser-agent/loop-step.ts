import type { BrowserSession } from "./session";
import type { BrowserAction } from "./action-parser";
import type { RuntimeStep } from "../run-agent-types";
import { verifyBrowserProgress } from "./progress-checker";
import { authorizeBrowserLoopAction, browserLoopEnabled, recordBrowserLoopOutcome } from "./loop-state";

interface BrowserResult { text: string; failed?: boolean }
/** Maker executes; separate checker observes evidence and records a bounded receipt. */
export async function runP8BrowserLoopStep<T extends BrowserResult>(
  taskId: string, session: BrowserSession, action: BrowserAction,
  notify: ((step: RuntimeStep) => void) | undefined,
  execute: () => Promise<T>,
): Promise<T> {
  if (!browserLoopEnabled()) return execute();
  const denied = authorizeBrowserLoopAction(taskId, action.op);
  if (denied) {
    recordBrowserLoopOutcome(taskId, action.op, "blocked");
    notify?.({ tool: "loop_blocked", detail: denied });
    return { text: denied, failed: true } as T;
  }
  const before = { url: session.page.url(), snapshot: session.lastSnapshot };
  try {
    const outcome = await execute();
    if (outcome.failed) {
      recordBrowserLoopOutcome(taskId, action.op, "failed");
      return outcome;
    }
    const proof = await verifyBrowserProgress(session, action, before).catch(
      () => ({ verified: false, reason: "not_observable" as const }));
    recordBrowserLoopOutcome(taskId, action.op, proof.verified ? "verified" : "unverified");
    notify?.({ tool: "loop_verifier", detail: proof.verified
      ? "Observable browser progress verified (" + proof.reason + ")."
      : "Browser action returned, but no independent progress proof yet." });
    return outcome;
  } catch (error) {
    recordBrowserLoopOutcome(taskId, action.op, "failed");
    throw error;
  }
}
