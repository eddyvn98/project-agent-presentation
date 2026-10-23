import { parseRichUiBlock } from "./rich-ui";
import type { ProjectAgentTaskSource } from "./types";
export type ValidationIssue = { severity: "error" | "warning"; code: string; message: string };
export type ValidationReport = { valid: boolean; issues: ValidationIssue[]; blockCount: number };
/** Structural checks only. Claims and source evidence still require human/tool verification. */
export function validateAgentAnswer(markdown: string, sources: ProjectAgentTaskSource[] = []): ValidationReport {
  const issues: ValidationIssue[] = [];
  let blockCount = 0;
  const lines = markdown.split(/\r?\n/);
  let fence: { marker: string; lang: string; body: string[]; line: number } | null = null;
  for (const [index, line] of lines.entries()) {
    const opening = /^\s*(`{3,}|~{3,})([^\s`~]*)/.exec(line);
    if (fence) {
      if (opening && opening[1][0] === fence.marker[0] && opening[1].length >= fence.marker.length && !opening[2]) {
        if (fence.lang === "agent-ui") {
          blockCount++;
          if (!parseRichUiBlock(fence.body.join("\n"))) {
            issues.push({ severity: "error", code: "INVALID_VISUAL", message: `Invalid agent-ui JSON/schema near line ${fence.line}.` });
          }
        }
        fence = null;
      } else fence.body.push(line);
    } else if (opening) {
      fence = { marker: opening[1], lang: opening[2].toLowerCase(), body: [], line: index + 1 };
    } else if (/\]\(\s*(?:javascript|data|vbscript):/i.test(line)) {
      issues.push({ severity: "error", code: "UNSAFE_LINK", message: `Executable Markdown link near line ${index + 1}.` });
    }
  }
  if (fence) issues.push({ severity: "warning", code: "INCOMPLETE_FENCE", message: `Unclosed code fence near line ${fence.line}.` });
  for (const [index, source] of sources.entries()) {
    try {
      if (!/^https?:$/.test(new URL(source.url).protocol)) throw new Error("Unsupported scheme");
      if (!source.title.trim()) issues.push({ severity: "warning", code: "UNTITLED_SOURCE", message: `Source ${index + 1} has no title.` });
    } catch { issues.push({ severity: "error", code: "UNSAFE_SOURCE", message: `Source ${index + 1} lacks a safe HTTP(S) URL.` }); }
  }
  if (!markdown.trim()) issues.push({ severity: "warning", code: "EMPTY_ANSWER", message: "The answer contains no prose." });
  return { valid: !issues.some((item) => item.severity === "error"), issues, blockCount };
}
