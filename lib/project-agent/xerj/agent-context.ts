import { recallProjectHindsight } from "../hindsight/memory";
import { getProjectAccess } from "@/lib/capabilities/project-sharing";
import { prefetchProjectXerj } from "./search";

interface AgentContextInput {
  projectId: string;
  ownerEmail: string;
  query: string;
  signal?: AbortSignal;
  log?: (message: string) => void;
}

/** Both data sources are optional; existing authorized Project knowledge stays authoritative. */
export async function loadAgentSearchContext(input: AgentContextInput): Promise<{
  hindsightMemory: string; xerjContext: string;
}> {
  // Recheck access at the moment of retrieval: Project membership may have changed mid-run.
  if (!input.projectId || !input.ownerEmail) return { hindsightMemory: "", xerjContext: "" };
  try {
    if (!await getProjectAccess(input.projectId, input.ownerEmail))
      return { hindsightMemory: "", xerjContext: "" };
  } catch { return { hindsightMemory: "", xerjContext: "" }; }
  const [hindsight, xerj] = await Promise.allSettled([
    recallProjectHindsight(input),
    prefetchProjectXerj(input.projectId, input.query, input.signal),
  ]);
  // Critical L9 fence: membership may be revoked after the initial check but before retrieval completes.
  if (input.signal?.aborted) return { hindsightMemory: "", xerjContext: "" };
  try {
    if (!await getProjectAccess(input.projectId, input.ownerEmail))
      return { hindsightMemory: "", xerjContext: "" };
  } catch { return { hindsightMemory: "", xerjContext: "" }; }
  const hindsightMemory = hindsight.status === "fulfilled" ? hindsight.value : "";
  const xerjContext = xerj.status === "fulfilled" ? xerj.value : "";
  if (xerjContext) input.log?.("using tool xerj_search :: Project indexed corpus");
  return { hindsightMemory, xerjContext };
}
