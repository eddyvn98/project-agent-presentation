export type MarkdownCodeRange = { start: number; end: number };
export type MarkdownFence = MarkdownCodeRange & {
  line: number;
  language: string;
  marker: string;
  markerStart: number;
  markerEnd: number;
  contentStart: number;
  contentEnd: number;
  content: string;
  continuationPrefix: string;
  closingStart: number | null;
  closingMarkerStart: number | null;
  closingMarkerEnd: number | null;
  openingLineComplete: boolean;
};

type Container = { kind: "quote" } | { kind: "list"; padding: number; marker: string };
type Fence = MarkdownFence & { containers: Container[]; indent: number };
type IndentedCode = MarkdownCodeRange & { containers: Container[] };
type HtmlBlock = IndentedCode & { endPattern: RegExp | null };

// Only the scanner sees expanded tabs. Returned ranges always refer to the untouched source.
function expandTabs(line: string): string {
  let column = 0;
  return line.replace(/\t|[^\t]+/g, (part) => {
    const value = part === "\t" ? " ".repeat(4 - column % 4) : part;
    column += value.length;
    return value;
  });
}

function stripColumns(line: string, count: number): string {
  let column = 0, index = 0;
  while (index < line.length && column < count) {
    column += line[index] === "\t" ? 4 - column % 4 : 1;
    index += 1;
  }
  return " ".repeat(Math.max(0, column - count)) + line.slice(index);
}

function continueContainers(line: string, containers: Container[]) {
  let rest = line, depth = 0;
  for (const container of containers) {
    if (container.kind === "quote") {
      const prefix = /^ {0,3}> ?/.exec(rest)?.[0];
      if (!prefix) break;
      rest = rest.slice(prefix.length);
    } else if (!rest.trim()) rest = "";
    else if (rest.startsWith(" ".repeat(container.padding))) rest = rest.slice(container.padding);
    else break;
    depth += 1;
  }
  return { rest, depth };
}

const thematicBreak = (line: string) => /^ {0,3}(?:(?:\* *){3,}|(?:- *){3,}|(?:_ *){3,})$/.test(line);

function openingFence(line: string) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match || (match[1][0] === "`" && match[2].includes("`"))) return null;
  return { marker: match[1], language: match[2].trim().split(/\s+/)[0].toLowerCase(),
    indent: line.length - line.trimStart().length };
}

function listPrefix(line: string, interruptingParagraph: boolean) {
  if (thematicBreak(line)) return null;
  const match = /^( {0,3})([-+*]|\d{1,9}[.)])( +|$)/.exec(line);
  if (!match) return null;
  const rest = line.slice(match[0].length);
  if (interruptingParagraph && (!rest || (/^\d/.test(match[2]) && !/^1[.)]$/.test(match[2])))) return null;
  // More than four padding spaces belong to indented content; only one belongs to the marker.
  const padding = match[1].length + match[2].length + (!rest || match[3].length > 4 ? 1 : match[3].length || 1);
  return { padding, length: Math.min(padding, line.length), marker: match[2] };
}

function blockStarts(line: string): boolean {
  return !!openingFence(line) || thematicBreak(line) || !!listPrefix(line, true) ||
    /^ {0,3}(?:>|#{1,6}(?: |$)|=+ *$)/.test(line) || htmlBlockEnd(line, true) !== undefined;
}

function htmlBlockEnd(line: string, paragraph: boolean): RegExp | null | undefined {
  const raw = /^ {0,3}<(script|pre|style|textarea)(?:[ >]|$)/i.exec(line);
  if (raw) return new RegExp(`</${raw[1]}\\s*>`, "i");
  if (/^ {0,3}<!--/.test(line)) return /-->/;
  if (/^ {0,3}<\?/.test(line)) return /\?>/;
  if (/^ {0,3}<!\[CDATA\[/.test(line)) return /\]\]>/;
  if (/^ {0,3}<![A-Z]/.test(line)) return />/;
  if (/^ {0,3}<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:[ />]|$)/i.test(line)) return null;
  if (!paragraph && /^ {0,3}<\/?[a-z][a-z\d-]*(?: +[^<>]*|\/?)> *$/i.test(line)) return null;
  return undefined;
}

function addContainers(line: string, containers: Container[], paragraph: boolean) {
  let rest = line;
  for (;;) {
    const quote = /^ {0,3}> ?/.exec(rest)?.[0];
    if (quote) { containers.push({ kind: "quote" }); rest = rest.slice(quote.length); paragraph = false; continue; }
    const list = listPrefix(rest, paragraph);
    if (!list) break;
    containers.push({ kind: "list", padding: list.padding, marker: list.marker });
    rest = rest.slice(list.length);
    paragraph = false;
  }
  return rest;
}

function inlineCodeRanges(markdown: string, start: number, end: number): MarkdownCodeRange[] {
  const text = markdown.slice(start, end);
  const runs = Array.from(text.matchAll(/`+/g), (match) => {
    let slashes = 0;
    for (let before = match.index - 1; before >= 0 && text[before] === "\\"; before -= 1) slashes += 1;
    return { index: match.index, length: match[0].length, escaped: slashes % 2 };
  });
  const next = new Map<number, number>();
  const closes: number[] = [];
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    closes[index] = next.get(runs[index].length - runs[index].escaped) ?? -1;
    next.set(runs[index].length, index);
  }
  const ranges: MarkdownCodeRange[] = [];
  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index];
    if (run.length === run.escaped || closes[index] < 0) continue;
    const close = runs[closes[index]];
    // A blank line ends the paragraph, so a later backtick cannot close this code span.
    if (/\n[\t ]*\n/.test(text.slice(run.index + run.length, close.index).replace(/\r\n?/g, "\n"))) continue;
    ranges.push({ start: start + run.index + run.escaped, end: start + close.index + close.length });
    index = closes[index];
  }
  return ranges;
}

/** Locate literal code without rewriting it. List/quote fences end when their container ends. */
export function scanMarkdownCode(markdown: string, includeInline = true): {
  blocks: MarkdownCodeRange[];
  ranges: MarkdownCodeRange[];
  fences: MarkdownFence[];
  openFence: MarkdownFence | null;
} {
  const blocks: MarkdownCodeRange[] = [];
  const fences: MarkdownFence[] = [];
  let containers: Container[] = [];
  let fence: Fence | null = null;
  let indented: IndentedCode | null = null;
  let html: HtmlBlock | null = null;
  let paragraph = false, lineNumber = 0;
  for (const line of markdown.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)) {
    if (!line[0]) continue;
    lineNumber += 1;
    const start = line.index, end = start + line[0].length;
    const expanded = expandTabs(line[1]);
    let continued = continueContainers(expanded, containers);
    if (html) {
      continued = continueContainers(expanded, html.containers);
      if (continued.depth === html.containers.length && (html.endPattern || continued.rest.trim())) {
        html.end = end;
        if (html.endPattern?.test(continued.rest)) html = null;
        continue;
      }
      html = null;
      paragraph = false;
    }
    if (fence) {
      continued = continueContainers(expanded, fence.containers);
      if (continued.depth === fence.containers.length) {
        fence.end = end;
        const close = /^ {0,3}(`{3,}|~{3,}) *$/.exec(continued.rest)?.[1];
        if (close && close[0] === fence.marker[0] && close.length >= fence.marker.length) {
          fence.contentEnd = start;
          fence.closingStart = start;
          fence.closingMarkerStart = start + line[1].indexOf(close);
          fence.closingMarkerEnd = fence.closingMarkerStart + close.length;
          fence = null;
        } else {
          const indentation = Math.min(fence.indent, /^ */.exec(continued.rest)![0].length);
          fence.content += stripColumns(line[1], expanded.length - continued.rest.length + indentation) + (line[2] ? "\n" : "");
          fence.contentEnd = end;
        }
        continue;
      }
      // Missing quote/list indentation implicitly closes the block before this line.
      fence = null;
      paragraph = false;
    }
    if (indented) {
      continued = continueContainers(expanded, indented.containers);
      if (continued.depth === indented.containers.length && (!continued.rest.trim() || /^ {4}/.test(continued.rest))) {
        indented.end = end;
        continue;
      }
      indented = null;
      paragraph = false;
    }
    const interrupted = containers[continued.depth];
    const sibling = interrupted?.kind === "list" ? listPrefix(continued.rest, false) : null;
    const sameList = sibling && interrupted?.kind === "list" &&
      (!/^\d/.test(sibling.marker) || (/^\d/.test(interrupted.marker) && sibling.marker.at(-1) === interrupted.marker.at(-1)));
    if (continued.depth < containers.length && paragraph && !sameList && continued.rest.trim() && !blockStarts(continued.rest)) {
      // Only paragraphs allow lazy list/quote continuation; fenced code never does.
      continue;
    }
    if (sameList) paragraph = false;
    containers = containers.slice(0, continued.depth);
    const rest = addContainers(continued.rest, containers, paragraph);
    if (containers.length > continued.depth) paragraph = false;
    const opener = openingFence(rest);
    const htmlEnd = htmlBlockEnd(rest, paragraph);
    if (opener) {
      const markerStart = start + line[1].indexOf(opener.marker);
      fence = { start, end, line: lineNumber, language: opener.language, marker: opener.marker, markerStart,
        markerEnd: markerStart + opener.marker.length, contentStart: end, contentEnd: end, content: "",
        continuationPrefix: containers.map((container) => container.kind === "quote" ? "> " : " ".repeat(container.padding)).join("") + " ".repeat(opener.indent),
        closingStart: null, closingMarkerStart: null, closingMarkerEnd: null,
        openingLineComplete: !!line[2], containers: [...containers], indent: opener.indent };
      blocks.push(fence);
      fences.push(fence);
      paragraph = false;
    } else if (htmlEnd !== undefined) {
      html = { start, end, containers: [...containers], endPattern: htmlEnd };
      blocks.push(html);
      if (htmlEnd?.test(rest)) html = null;
      paragraph = false;
    } else if (!paragraph && /^ {4,}\S/.test(rest)) {
      indented = { start, end, containers: [...containers] };
      blocks.push(indented);
    } else paragraph = !!rest.trim() && !blockStarts(rest);
  }
  if (!includeInline) return { blocks, ranges: blocks, fences, openFence: fence };
  const ranges: MarkdownCodeRange[] = [];
  let cursor = 0;
  for (const block of blocks) {
    ranges.push(...inlineCodeRanges(markdown, cursor, block.start), block);
    cursor = block.end;
  }
  ranges.push(...inlineCodeRanges(markdown, cursor, markdown.length));
  return { blocks, ranges, fences, openFence: fence };
}
