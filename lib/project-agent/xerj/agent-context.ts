import { recallProjectHindsight } from "../hindsight/memory";
import { prefetchProjectXerj } from "./search";

interface AgentContextInput {
  projectId: string;
  query: string;
  signal?: AbortSignal;
  log?: (message: string) => void;
}

/** Both data sources are optional; existing authorized Project knowledge stays authoritative. */
export async function loadAgentSearchContext(input: AgentContextInput): Promise<{
  hindsightMemory: string; xerjContext: string;
}> {
  const [hindsightMemory, xerjContext] = await Promise.all([
    recallProjectHindsight(input),
    prefetchProjectXerj(input.projectId, input.query, input.signal),
  ]);
  if (xerjContext) input.log?.("using tool xerj_search :: Project indexed corpus");
  return { hindsightMemory, xerjContext };
}
