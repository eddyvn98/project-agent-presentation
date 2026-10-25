import type { BrowserSession } from "./session";
import type { BrowserAction } from "./action-parser";
import type { RuntimeStep } from "../run-agent-types";
import { verifyBrowserProgress } from "./progress-checker";
import { authorizeBrowserLoopAction, browserLoopEnabled, recordBrowserLoopOutcome, browserLoopStatus } from "./loop-state";

interface BrowserResult { text: string; failed?: boolean }
/** Maker executes; separate checker observes evidence and records a bounded receipt. */
export async function runP8BrowserLoopStep<T extends BrowserResult>(
  taskId: string, session: BrowserSession, action: BrowserAction,
  notify: ((step: RuntimeStep) => void) | undefined,
  execute: () => Promise<T>,
): Promise<T> {
  if (!browserLoopEnabled()) return execute();
  const record = (outcome: "verified" | "unverified" | "failed" | "blocked") => {
    const prior = browserLoopStatus(taskId)?.phase;
    recordBrowserLoopOutcome(taskId, action.op, outcome);
    if (prior !== "needs_help" && browserLoopStatus(taskId)?.phase === "needs_help")
      notify?.({ tool: "loop_escalation", detail:
        "Browser actions show no new verified progress. Consider taking over in Browser Watch." });
  };
  const denied = authorizeBrowserLoopAction(taskId, action.op);
  if (denied) {
    record("blocked");
    notify?.({ tool: "loop_blocked", detail: denied });
    return { text: denied, failed: true } as T;
  }
  const before = { url: session.page.url(), snapshot: session.lastSnapshot };
  try {
    const outcome = await execute();
    if (outcome.failed) {
      record("failed");
      return outcome;
    }
    const proof = await verifyBrowserProgress(session, action, before).catch(
      () => ({ verified: false, reason: "not_observable" as const }));
    record(proof.verified ? "verified" : "unverified");
    notify?.({ tool: "loop_verifier", detail: proof.verified
      ? "Observable browser progress verified (" + proof.reason + ")."
      : "Browser action returned, but no independent progress proof yet." });
    return outcome;
  } catch (error) {
    record("failed");
    throw error;
  }
}
