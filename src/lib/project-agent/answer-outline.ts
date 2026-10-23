import { scanMarkdownCode } from "./markdown-code-ranges";

export type AnswerHeading = { id: string; label: string; level: number };

/** IDs use source line numbers so repeated headings and multiple answers never collide. */
export function getAnswerOutline(markdown: string, prefix: string): AnswerHeading[] {
  const headings: AnswerHeading[] = [];
  const literals = scanMarkdownCode(markdown, false).blocks;
  let lineNumber = 0, literalIndex = 0;
  for (const line of markdown.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)) {
    if (!line[0]) continue;
    lineNumber += 1;
    while (literals[literalIndex] && literals[literalIndex].end <= line.index) literalIndex += 1;
    if (literals[literalIndex] && literals[literalIndex].start <= line.index) continue;
    const heading = /^ {0,3}(#{1,3})[\t ]+(.+?)(?:[\t ]+#+[\t ]*)?$/.exec(line[1]);
    if (heading) headings.push({
      id: `${prefix}-heading-${lineNumber}`,
      label: heading[2].replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, ""),
      level: heading[1].length,
    });
  }
  return headings;
}
