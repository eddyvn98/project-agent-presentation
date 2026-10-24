import type { ProjectAgentTask } from "../types";
import { selectHarnessForTask } from "./rollout";

/** Attach only owner-authorized, non-executable advice; errors leave the base harness unchanged. */
export async function attachHarnessToQuery(
  task: ProjectAgentTask, query: string,
  log: (line: string) => Promise<unknown>,
): Promise<string> {
  const choice = await selectHarnessForTask(task).catch(() => null);
  if (!choice) return query;
  await log("harness_variant :: " + choice.variantId + " " + choice.group).catch(() => {});
  return query + choice.addendum;
}
