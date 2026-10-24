import type { RuntimeInput } from "../run-agent-types";
import { runBrowserAction } from "./index";
import { browserControlState, waitForBrowserHandoff } from "./control";

/** Called before a model turn; returns the latest real page after the human hands control back. */
export async function resumedBrowserContext(input: RuntimeInput, seen: number, step: number) {
  if (!input.taskId) return { revision: seen, preface: "" };
  const revision = await waitForBrowserHandoff(input.taskId, input.signal);
  if (revision === seen) return { revision, preface: "" };
  const current = await runBrowserAction(input, { action: "browser", op: "snapshot" }, step);
  const preface = "The user temporarily took control of the browser and handed it back. Discard any stale element references and previous page assumptions. Reinspect the live page before acting.\\n"
    + current.text.slice(0, 6500) + "\\n\\n";
  input.onStep?.({ tool: "user_note", detail: "Human browser assistance completed; page snapshot refreshed" });
  return { revision, preface };
}

/** Model output made before manual intervention must never execute after the takeover. */
export async function browserPlanOutdated(input: RuntimeInput, beforeRevision: number): Promise<boolean> {
  if (!input.taskId) return false;
  const revision = await waitForBrowserHandoff(input.taskId, input.signal);
  return revision !== beforeRevision || browserControlState(input.taskId).paused;
}
