import { scanMarkdownCode } from "./markdown-code-ranges";

export type StreamingPresentation = {
  text: string;
  pending: "visual" | "writing" | "code" | null;
  /** One-based source line of the ordinary code fence still receiving text. */
  codeStartLine?: number;
};

/** Presentation only: code can grow visibly, structured payloads wait for a closing fence. */
export function prepareStreamingPresentation(markdown: string): StreamingPresentation {
  const fence = scanMarkdownCode(markdown, false).openFence;
  if (!fence) return { text: markdown, pending: null };
  const kind = fence.language === "agent-doc" ? "writing" :
    ["agent-ui", "mermaid", "ong-ui"].includes(fence.language) ? "visual" : "code";
  // An unfinished opening line might still be the name of a structured block.
  const code = kind === "code" ? { codeStartLine: fence.line } : {};
  if (kind !== "code" || !fence.openingLineComplete) {
    return { text: markdown.slice(0, fence.start), pending: kind, ...code };
  }
  return { text: markdown, pending: "code", ...code };
}
