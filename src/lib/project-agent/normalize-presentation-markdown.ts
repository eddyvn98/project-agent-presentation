import { scanMarkdownCode, type MarkdownCodeRange } from "./markdown-code-ranges";

const malformedProjectFileLink = /\[([^\]\r\n]+)\]\(\s*<a\s+href=(["'])(\/api\/projects\/[^"'<>\s]+)\2[^>]*>[\s\S]*?<\/a>\s*\)/gi;
const bareAgentUi = /(^|\r\n|\r|\n)([\t ]*)(?:agent-ui|agent_ui)[\t ]*(?:(\r\n|\r|\n)[\t ]*)?(\{[^\r\n]*\})[\t ]*(?=\r\n|\r|\n|$)/g;
const overlaps = (ranges: MarkdownCodeRange[], start: number, end: number) =>
  ranges.some((range) => range.start < end && range.end > start);

/** Restore omitted structured-fence markers only outside existing literal content. */
export function repairPresentationFences(markdown: string): string {
  if (!/(^|[\r\n])[\t ]*agent[-_]ui(?:[\t {\r\n]|$)/.test(markdown)) return markdown;
  const original = scanMarkdownCode(markdown);
  const defaultEnding = /\r\n|\r|\n/.exec(markdown)?.[0] || "\n";
  return markdown.replace(bareAgentUi, (match: string, lead: string, indent: string,
    ending: string | undefined, json: string, offset: number) => {
    const start = offset + lead.length;
    const marker = start + indent.length;
    if (overlaps(original.blocks, start, offset + match.length) || overlaps(original.ranges, marker, marker + 1)) return match;
    const newline = ending || (lead || defaultEnding);
    return `${lead}${indent}\`\`\`agent-ui${newline}${indent}${json}${newline}${indent}\`\`\``;
  });
}

/** Repair known prose mistakes while keeping supplied fenced, indented and inline code literal. */
export function normalizePresentationMarkdown(markdown: string): string {
  const repaired = repairPresentationFences(markdown);
  if (!/\/api\/projects\//i.test(repaired) || !/<a\s+href=/i.test(repaired)) return repaired;
  // Newly repaired structured payloads are literal too; links inside their JSON must not change.
  const literals = scanMarkdownCode(repaired).ranges;
  return repaired.replace(malformedProjectFileLink, (match: string, label: string, _quote: string, href: string, offset: number) =>
    overlaps(literals, offset, offset + match.length) ? match : `[${label}](${href})`);
}
