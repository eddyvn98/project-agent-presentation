import { getProjectAccess } from "@/lib/capabilities/project-sharing";
import type { RuntimeAction } from "../runtime/actions";
import type { RuntimeInput } from "../runtime/run-agent-types";
import { searchProjectXerj, readProjectXerj } from "./search";

export type XerjRuntimeAction = Extract<RuntimeAction, { action: "xerj_search" | "xerj_read" }>;

/** Defense in depth: do not call an external index unless the running task still has Project access. */
export async function runXerjAction(input: RuntimeInput, action: XerjRuntimeAction) {
  if (!input.projectId || !input.ownerEmail) return { text: "No authorized Project scope for indexed search.", failed: true };
  try {
    if (!await getProjectAccess(input.projectId, input.ownerEmail)) {
      return { text: "Project access is no longer available.", failed: true };
    }
  } catch { return { text: "Project access could not be checked.", failed: true }; }
  input.onStep?.({ tool: action.action, detail: action.note || (action.action === "xerj_search" ? action.query : action.index) });
  return action.action === "xerj_search"
    ? searchProjectXerj(input.projectId, action.query, action.count, input.signal)
    : readProjectXerj(input.projectId, action.index, action.id, input.signal);
}
