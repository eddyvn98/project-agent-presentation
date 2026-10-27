import { describe, expect, it } from "vitest";
import { colorizeMermaidNodes, MERMAID_THEME } from "../src/lib/project-agent/mermaid-palette";

function diagram() {
  const nodeSvg = ["rect", "polygon", "rect", "circle"]
    .map((tag, i) => `<g class="node default"><${tag} data-shape="${i}"/></g>`).join("");
  return new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${nodeSvg}</svg>`, "image/svg+xml").documentElement;
}

describe("Mermaid node palette", () => {
  it("colors default flowchart nodes distinctly, with an amber decision and visible borders", () => {
    const svg = diagram();
    expect(colorizeMermaidNodes(svg, "flowchart TD\nA-->B")).toBe(4);
    const nodes = Array.from(svg.querySelectorAll("g.node"));
    const fills = nodes.map(n => (n.querySelector("rect,polygon,circle") as SVGElement).style.fill);
    expect(new Set(fills).size).toBeGreaterThanOrEqual(3);
    expect(fills[1]).toBe("rgb(254, 243, 199)");
    for (const node of nodes) {
      const shape = node.querySelector("rect,polygon,circle") as SVGElement;
      expect(shape.style.stroke).toBeTruthy();
      expect(shape.style.fill).not.toBe("#ffffff");
    }
    expect(MERMAID_THEME.themeVariables.primaryTextColor).toBe("#0f172a");
  });

  it("preserves authored styles/classDefs and avoids recoloring unrelated diagrams", () => {
    for (const source of ["flowchart TD\nstyle A fill:#ff0000",
      "flowchart LR\nclassDef critical fill:#ee0000",
      "flowchart LR\nA:::critical --> B",
      "sequenceDiagram\nAlice->>Bob: Hello"]) {
      const svg = diagram();
      expect(colorizeMermaidNodes(svg, source)).toBe(0);
      expect(svg.querySelector("rect")?.getAttribute("style")).toBeNull();
    }
  });

  it("never overrides an existing fill on an individual shape", () => {
    const svg = diagram();
    svg.querySelector("rect")?.setAttribute("style", "fill: #123456");
    expect(colorizeMermaidNodes(svg, "flowchart TD\nA-->B")).toBe(3);
    expect((svg.querySelector("rect") as SVGElement).style.fill).toBe("rgb(18, 52, 86)");
  });
});
