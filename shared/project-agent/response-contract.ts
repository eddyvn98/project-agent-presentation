/** One wire vocabulary for both Project Agent renderers; legacy fences stay accepted. */
export const RESPONSE_BLOCK_TYPES = [
  "kpis", "chart", "progress", "stack", "options", "callout", "steps",
  "explorer", "mermaid", "scene3d", "ask", "form", "interactive", "quiz", "followups",
] as const;
export type ResponseBlockType = typeof RESPONSE_BLOCK_TYPES[number];
export type ResponseSurface = "host" | "demo";
export const RESPONSE_FENCE = { host: "ong-ui", demo: "agent-ui" } as const;
export const RESPONSE_DOCUMENT_FENCE = { host: "ong-doc", demo: "agent-doc" } as const;

/** Renames *only* fenced block language headers. Never modifies inline prose/JSON. */
export function normalizeResponseFences(markdown: string, surface: ResponseSurface): string {
  return markdown.replace(/^(\s*)(`{3,}|~{3,})(ong-ui|agent-ui|ong_ui|agent_ui|ong-doc|agent-doc)([ \t]*)$/gm,
    (_whole, indent: string, ticks: string, raw: string, trailing: string) => {
      const doc = raw.endsWith("-doc");
      return indent + ticks + (doc ? RESPONSE_DOCUMENT_FENCE[surface] : RESPONSE_FENCE[surface]) + trailing;
    });
}
