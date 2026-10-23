import { scanMarkdownCode } from "./markdown-code-ranges";

/** Break a complete Markdown answer into slides at H2 headings, never inside literal blocks. */
export function splitPresentationSections(markdown: string): string[] {
  const sections: string[] = [];
  const literals = scanMarkdownCode(markdown, false).blocks;
  let start = 0, literalIndex = 0;
  for (const line of markdown.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)) {
    if (!line[0]) continue;
    while (literals[literalIndex] && literals[literalIndex].end <= line.index) literalIndex += 1;
    if (literals[literalIndex] && literals[literalIndex].start <= line.index) continue;
    if (/^ {0,3}##[\t ]+\S/.test(line[1]) && markdown.slice(start, line.index).trim()) {
      sections.push(markdown.slice(start, line.index).trim());
      start = line.index;
    }
  }
  if (markdown.slice(start).trim()) sections.push(markdown.slice(start).trim());
  return sections.length ? sections : [markdown];
}

/** Legacy conservative policy: withhold every open fence, including ordinary code. */
export function completedStreamingMarkdown(markdown: string): { text: string; pending: boolean } {
  const fence = scanMarkdownCode(markdown, false).openFence;
  return fence ? { text: markdown.slice(0, fence.start).replace(/(?:\r\n|\r|\n)$/, ""), pending: true }
    : { text: markdown, pending: false };
}
