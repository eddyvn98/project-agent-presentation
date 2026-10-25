import type { RuntimeInput } from "./run-agent-types";
import { activeBrowserSession } from "./browser-agent/session";
import { browserLoopStatus } from "./browser-agent/loop-state";
import { p8QaBrowserProbe } from "./browser-agent/p8-qa-fixture";

export type G1Scenario = "success" | "premature";
const PREFIX = "[G1_SYNTHETIC_QA] counter target=1 scenario=";
export const g1QaPrompt = (scenario: G1Scenario) => PREFIX + scenario;
export interface G1GoalReceipt {
  kind: "g1_dom_counter_v1";
  taskId: string;
  expected: 1;
  observed: 1;
  p8Verified: number;
  pageNetworkAttempts: 0;
  checker: "chromium_dom";
}
interface G1Identity { taskId?: string; ownerEmail?: string; userPrompt?: string }
export function isG1QaIdentity(input: G1Identity): boolean {
  return process.env.PROJECT_AGENT_G1_QA === "1" &&
    process.env.PROJECT_AGENT_P8_QA_SESSION === "1" &&
    process.env.PROJECT_AGENT_P8_LOOP === "1" &&
    ["development", "test"].includes(process.env.NODE_ENV ?? "") &&
    Boolean(input.taskId && /^pat_[a-f0-9]{12}$/.test(input.taskId)) &&
    Boolean(input.ownerEmail?.toLowerCase().endsWith("@project-agent.test")) &&
    [g1QaPrompt("success"), g1QaPrompt("premature")].includes(input.userPrompt ?? "");
}
export function isG1QaTask(task: { id: string; ownerEmail: string; prompt: string; userPrompt?: string }): boolean {
  return task.prompt === task.userPrompt && isG1QaIdentity({
    taskId: task.id, ownerEmail: task.ownerEmail, userPrompt: task.userPrompt,
  });
}
/** A synthetic goal run cannot dispatch shell, web, login, or outside actions. */
export function g1QaActionAllowed(input: G1Identity, action: { action: string; op?: string }): boolean {
  return !isG1QaIdentity(input) ||
    (action.action === "browser" && ["snapshot", "click"].includes(action.op ?? ""));
}
/** Do not trust tool return, model claim, or a model-written receipt. */
export async function checkG1SyntheticGoal(input: RuntimeInput): Promise<G1GoalReceipt | null> {
  if (input.depth || !isG1QaIdentity(input)) return null;
  const session = activeBrowserSession(input.taskId!);
  if (!session?.browser.isConnected() || session.page.isClosed() ||
      session.owner !== input.ownerEmail?.toLowerCase() ||
      session.page.url() !== "about:blank")
    throw new Error("G1 goal checker: synthetic Chromium session unavailable");
  const marker = await session.page.locator('[data-p7-synthetic="true"]').count();
  const observed = await session.page.locator("#qa-output").textContent({ timeout: 2000 });
  const loop = browserLoopStatus(input.taskId!);
  const probe = p8QaBrowserProbe(input.taskId!);
  if (marker !== 1 || observed?.trim() !== "1" || !loop ||
      loop.verified < 1 || loop.actions < 1 || !probe.connected ||
      probe.networkAttempts !== 0)
    throw new Error("G1 goal checker: counter target not independently verified");
  return { kind: "g1_dom_counter_v1", taskId: input.taskId!,
    expected: 1, observed: 1, p8Verified: loop.verified,
    pageNetworkAttempts: 0, checker: "chromium_dom" };
}
export function formatG1Receipt(receipt: G1GoalReceipt): string {
  return "[G1_VERIFIED_RECEIPT " + JSON.stringify(receipt) + "]";
}
