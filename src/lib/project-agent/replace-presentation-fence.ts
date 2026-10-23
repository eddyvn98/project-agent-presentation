import { scanMarkdownCode } from "./markdown-code-ranges";

const normalizeEndings = (source: string) => source.replace(/\r\n?|\n/g, "\n");

/** Replace exactly one completed fence supplied by the host, preserving its container and info string. */
export function replacePresentationFence(markdown: string, language: string,
  originalSource: string, replacementSource: string): string {
  const expected = normalizeEndings(originalSource);
  const matches = scanMarkdownCode(markdown, false).fences.filter((fence) =>
    fence.language === language.trim().toLowerCase() && (fence.content === "\n" ? "" : fence.content) === expected);
  if (matches.length !== 1) throw new Error(matches.length ?
    "This source occurs in more than one block. The host must identify the block before saving." :
    "The original block changed or is incomplete. Reload it before saving.");
  const fence = matches[0];
  if (fence.closingStart === null || fence.closingMarkerStart === null || fence.closingMarkerEnd === null) {
    throw new Error("The original block is incomplete. Finish it before saving.");
  }
  const replacement = normalizeEndings(replacementSource);
  let longest = 0, run = 0;
  for (const character of replacement) {
    run = character === fence.marker[0] ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const marker = fence.marker[0].repeat(Math.max(fence.marker.length, fence.closingMarkerEnd - fence.closingMarkerStart, longest + 1));
  const ending = /\r\n|\r|\n/.exec(markdown.slice(fence.markerEnd, fence.contentStart))?.[0] || "\n";
  const lines = replacement.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const body = lines.map((line) => `${fence.continuationPrefix}${line}${ending}`).join("");
  return markdown.slice(0, fence.markerStart) + marker + markdown.slice(fence.markerEnd, fence.contentStart) + body +
    markdown.slice(fence.closingStart, fence.closingMarkerStart) + marker +
    markdown.slice(fence.closingMarkerEnd, fence.end) + markdown.slice(fence.end);
}
