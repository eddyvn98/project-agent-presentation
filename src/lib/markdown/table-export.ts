/** Keep table exports as data when pasted into a spreadsheet. */
export function spreadsheetSafeCell(value: string): string {
  return /^[\t\r\n]/.test(value) || /^[\s\uFEFF\u200B]*[=+\-@]/.test(value) ? `'${value}` : value;
}

export function serializeTable(rows: string[][], delimiter: "," | "\t" = ","): string {
  return rows.map((row) => row.map((value) => {
    const text = spreadsheetSafeCell(value);
    return text.includes(delimiter) || /["\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(delimiter)).join("\r\n");
}

function readableMath(node: Element): string {
  if (node.localName === "annotation" || node.localName === "annotation-xml") return "";
  const parts = Array.from(node.children, readableMath);
  if (!parts.length) return node.textContent || "";
  switch (node.localName) {
    case "mfrac": return `(${parts[0] || ""})/(${parts[1] || ""})`;
    case "msup": return `${parts[0] || ""}^(${parts[1] || ""})`;
    case "msub": return `${parts[0] || ""}_(${parts[1] || ""})`;
    case "msubsup": return `${parts[0] || ""}_(${parts[1] || ""})^(${parts[2] || ""})`;
    case "msqrt": return `sqrt(${parts.join("")})`;
    case "mroot": return `root(${parts[0] || ""}, ${parts[1] || ""})`;
    case "mtr": return parts.join(", ");
    case "mtable": return `[${parts.join("; ")}]`;
    default: return parts.join("");
  }
}

/** Read rendered cell labels, excluding decorative controls and duplicate TeX annotations. */
export function readRenderedTable(table: HTMLTableElement): string[][] {
  return Array.from(table.rows, (row) => Array.from(row.cells, (cell) => {
    const clone = cell.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".katex").forEach((math) => {
      const source = math.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
      const mathml = math.querySelector("math");
      math.replaceWith(source || math.getAttribute("aria-label") ||
        (mathml ? mathml.getAttribute("alttext") || readableMath(mathml) : math.textContent || ""));
    });
    clone.querySelectorAll("script, style, annotation, .sr-only, [aria-hidden='true']").forEach((item) => item.remove());
    clone.querySelectorAll("br").forEach((item) => item.replaceWith("\n"));
    clone.querySelectorAll("img").forEach((item) => item.replaceWith(item.getAttribute("alt") || ""));
    return (clone.textContent || "").trim();
  }));
}
