import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProjectAgentTaskAnswer } from "../../components/features/projects/ProjectAgentTaskAnswer";

// jsdom does not implement browser layout observers used by Recharts.
beforeEach(() => vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const draw = (markdown: string, running = false) =>
  render(<ProjectAgentTaskAnswer markdown={markdown} sources={[]} resolveImage={() => null}
    running={running} language="en" />);
const fence = (type: string, payload: unknown) =>
  ["```" + type, JSON.stringify(payload), "```"].join("\n");
describe("host Agent complete response surface", () => {
  it("renders GFM table, heading, fenced code, source, and math without nesting invalid markup", () => {
    const { container } = draw([
      "## Response demo", "| Period | Revenue |", "|:--|--:|",
      "| Jan | 1,250 |", "", "A **strong** observation and `inline code`.",
      "", "A display equation:", "", "$$", "x^2+1=2", "$$",
      "", "[Synthetic link](https://example.com/fixture)",
      "", "```text", "┌────┐     ┌────┐", "│ A  │ ─▶  │ B  │", "└────┘     └────┘", "```",
    ].join("\n"));
    expect(screen.getByRole("heading", { name: "Response demo" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Scrollable response table" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Scrollable formula" })).toBeTruthy();
    expect(container.querySelector("p figure, a button")).toBeNull();
    expect(screen.getByRole("button", { name: /Show source: Synthetic link/ })).toBeTruthy();
    expect(container.querySelector("pre")?.className).toContain("whitespace-pre");
  });
  it("allows exact chart values to be read as an accessible table", () => {
    draw(fence("ong-ui", { type: "chart", kind: "line", title: "Revenue by month",
      categories: ["Jan", "Feb"], series: [
        { name: "Revenue", values: [1250, 1560] },
        { name: "Cost", values: [900, 920] },
      ] }));
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    const table = screen.getByRole("table", { name: /Revenue by month: exact values/ });
    expect(table.textContent).toContain("1,250");
    expect(table.textContent).toContain("1,560");
    expect(table.textContent).toContain("920");
    expect(table.querySelector('th[scope="row"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Chart" }));
    expect(screen.getByRole("region", { name: "Scrollable chart: Revenue by month" })).toBeTruthy();
  });
  it("shows a finished fallback for malformed visuals, never an endless loading animation", () => {
    draw(fence("ong-ui", { type: "chart", categories: ["A"], series: [] }));
    expect(screen.getByRole("status").textContent).toContain("Visual unavailable");
  });
  it("keeps incomplete streaming fences out of the rendered answer", () => {
    draw("Here is the explanation.\n\n```ong-ui\n{\"type\":", true);
    expect(screen.getByText("Here is the explanation.")).toBeTruthy();
    expect(screen.queryByText("Visual unavailable. Continue with the accompanying explanation.")).toBeNull();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });
});
