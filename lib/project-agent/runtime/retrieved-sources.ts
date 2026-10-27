import type { ProjectAgentTaskSource } from "../types";

/** Render citations only for pages actually fetched/opened by this run, never search snippets. */
export function appendRetrievedSources(answer: string, sources: ProjectAgentTaskSource[] = []): string {
  const linked = new Set<string>();
  const lines: string[] = [];
  for (const source of sources) {
    if (source.sourceType !== "page") continue;
    let uri: URL;
    try { uri = new URL(source.url); } catch { continue; }
    if (!["http:", "https:"].includes(uri.protocol) || uri.username || uri.password) continue;
    const url = uri.toString().replace(/[()]/g, char => encodeURIComponent(char));
    if (linked.has(url) || answer.includes(source.url)) continue;
    linked.add(url);
    const label = (source.title || uri.hostname).replace(/[\[\]\r\n]/g, " ").slice(0, 120);
    lines.push("- [" + label + "](" + url + ")");
    if (lines.length >= 8) break;
  }
  return lines.length ? answer.trimEnd() + "\n\nSources (retrieved pages):\n" + lines.join("\n") : answer;
}
