/** Break a complete Markdown answer into slides at H2 headings, never inside fences. */
export function splitPresentationSections(markdown: string): string[] {
  const sections: string[] = [];
  let current: string[] = [];
  let fence: { kind: string; size: number } | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = { kind: marker[0], size: marker.length };
      else if (marker[0] === fence.kind && marker.length >= fence.size && /^\s*(`{3,}|~{3,})\s*$/.test(line)) fence = null;
    }
    if (!fence && /^##\s+\S/.test(line) && current.join("\n").trim()) {
      sections.push(current.join("\n").trim());
      current = [];
    }
    current.push(line);
  }
  if (current.join("\n").trim()) sections.push(current.join("\n").trim());
  return sections.length ? sections : [markdown];
}
/** Keep incomplete fences out of ReactMarkdown until streaming closes them. */
export function completedStreamingMarkdown(markdown: string): { text: string; pending: boolean } {
  const lines = markdown.split(/\r?\n/);
  let open: { index: number; kind: string; size: number } | null = null;
  for (const [index, line] of lines.entries()) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (!marker) continue;
    if (!open) open = { index, kind: marker[0], size: marker.length };
    else if (marker[0] === open.kind && marker.length >= open.size && /^\s*(`{3,}|~{3,})\s*$/.test(line)) open = null;
  }
  return open ? { text: lines.slice(0, open.index).join("\n"), pending: true } : { text: markdown, pending: false };
}
