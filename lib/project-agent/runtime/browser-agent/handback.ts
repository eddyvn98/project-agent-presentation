import type { RuntimeInput } from "../run-agent-types";
import { runBrowserAction } from "./index";
import { browserControlState, waitForBrowserHandoff, waitForBrowserInterventionIdle } from "./control";
import { projectBrowserKey } from "./project-sessions";
import { readProjectControl, waitForProjectControl } from "./project-control-db";

/** Called before a model turn; refreshes the shared page after user intervention. */
export async function resumedBrowserContext(input: RuntimeInput, seen: number, step: number) {
  if (!input.taskId) return { revision: seen, preface: "" };
  const scope = input.projectId && input.ownerEmail &&
    process.env.PROJECT_AGENT_STEEL_BROWSER === "1" ?
      projectBrowserKey(input.projectId, input.ownerEmail) : null;
  const revision = scope ?
    (await waitForProjectControl(scope, input.signal)).revision :
    await waitForBrowserHandoff(input.taskId, input.signal);
  if (revision === seen) return { revision, preface: "" };
  if (!scope) await waitForBrowserInterventionIdle(input.taskId, 700, input.signal);
  const current = await runBrowserAction(input, { action: "browser", op: "snapshot" }, step);
  const preface = "The user interacted with the shared browser. Discard stale element references and previous page assumptions. Reinspect the live page before acting.\\n"
    + current.text.slice(0, 6500) + "\\n\\n";
  input.onStep?.({ tool: "user_note", detail: "Shared browser updated by user; page snapshot refreshed" });
  return { revision, preface };
}

/** Model output made before manual intervention must never execute after the takeover. */
export async function browserPlanOutdated(input: RuntimeInput, beforeRevision: number): Promise<boolean> {
  if (!input.taskId) return false;
  if (input.projectId && input.ownerEmail &&
      process.env.PROJECT_AGENT_STEEL_BROWSER === "1") {
    const state = await readProjectControl(projectBrowserKey(input.projectId, input.ownerEmail));
    return state.paused || (Boolean(state.activeTaskId) && state.activeTaskId !== input.taskId) ||
      state.revision !== beforeRevision;
  }
  const revision = await waitForBrowserHandoff(input.taskId, input.signal);
  return revision !== beforeRevision || browserControlState(input.taskId).paused;
}
