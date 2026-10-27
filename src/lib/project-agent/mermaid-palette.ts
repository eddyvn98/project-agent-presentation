/** Readable, accessible default colors for Mermaid flowchart nodes.
 * Explicit user-defined Mermaid style/class directives take precedence. */
const PALETTE = [
  { fill: "#dbeafe", stroke: "#2563eb" }, // Blue
  { fill: "#dcfce7", stroke: "#15803d" }, // Green
  { fill: "#ede9fe", stroke: "#7c3aed" }, // Violet
  { fill: "#cffafe", stroke: "#0e7490" }, // Cyan
  { fill: "#ffe4e6", stroke: "#be123c" }, // Rose
] as const;
const DECISION = { fill: "#fef3c7", stroke: "#b45309" } as const;
const SHAPE = "rect, polygon, path, circle, ellipse";

export function colorizeMermaidNodes(root: Element, code: string): number {
  // Mermaid's own styling takes priority. Do not overwrite authored colors.
  if (/^\s*(?:style\s+|classDef\s+|class\s+)|:::/m.test(code)) return 0;
  if (!/^\s*(?:flowchart|graph)\b/i.test(code)) return 0;
  let colored = 0;
  root.querySelectorAll("g.node").forEach((node, index) => {
    const shape = node.querySelector(SHAPE) as SVGElement | null;
    if (!shape || shape.style.fill || shape.hasAttribute("fill")) return;
    const decision = shape.tagName.toLowerCase() === "polygon" ||
      node.classList.contains("label-edge") || node.classList.contains("decision");
    const color = decision ? DECISION : PALETTE[index % PALETTE.length];
    shape.style.setProperty("fill", color.fill);
    shape.style.setProperty("stroke", color.stroke);
    shape.style.setProperty("stroke-width", "1.5px");
    node.setAttribute("data-agent-color", decision ? "decision" : String(index % PALETTE.length));
    colored++;
  });
  return colored;
}

export const MERMAID_THEME = {
  startOnLoad: false,
  theme: "base" as const,
  securityLevel: "strict" as const,
  themeVariables: {
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    primaryColor: "#dbeafe", primaryBorderColor: "#2563eb",
    primaryTextColor: "#0f172a", secondaryColor: "#dcfce7",
    secondaryTextColor: "#0f172a", tertiaryColor: "#fef3c7",
    tertiaryTextColor: "#0f172a", lineColor: "#64748b",
    textColor: "#0f172a",
  },
  flowchart: { curve: "linear" as const, nodeSpacing: 60, rankSpacing: 70 },
};
