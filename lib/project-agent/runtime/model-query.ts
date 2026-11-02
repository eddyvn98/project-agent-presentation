/** Experimental: keep changing Project context while reusing instructions already in Dify history. */
export function trimRepeatedRuntimeInstructions(query: string, instructions: string, otherStableBlocks: string[] = []): string {
  if (!instructions || !query.includes(instructions)) return query;
  let result = query.replace(instructions,
    "Continue using the app's sandbox action protocol and safety instructions from this conversation. " +
    "The Project context and the user request below are current; follow the latest user corrections.");
  for (const block of otherStableBlocks) if (block) result = result.replace(block, "");
  return result;
}
