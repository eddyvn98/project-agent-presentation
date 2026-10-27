import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProjectAgentTaskAnswer } from "../../components/features/projects/ProjectAgentTaskAnswer";

const fence = (tag: "ong-ui" | "agent-ui", block: unknown) =>
  ["```" + tag, JSON.stringify(block), "```"].join("\n");
const draw = (source: string, language: "vi" | "en" = "en", enable3DViewer = false) =>
  render(<ProjectAgentTaskAnswer markdown={source} language={language} sources={[]}
    resolveImage={() => null} enable3DViewer={enable3DViewer} />);
beforeEach(() => vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("host: rich response compatibility and interaction", () => {
  it("accepts a demo fence and localizes chart controls and exact values", () => {
    draw(fence("agent-ui", { type: "chart", kind: "line", title: "Revenue",
      categories: ["Jan", "Feb"], series: [{ name: "Sales", values: [1234.5, 1500] }] }), "vi");
    fireEvent.click(screen.getByRole("button", { name: "Bảng" }));
    expect(screen.getByRole("table").textContent).toContain("1.234,5");
    expect(screen.getByRole("columnheader", { name: "Danh mục" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Biểu đồ" }));
    expect(screen.getByRole("region", { name: "Biểu đồ có thể cuộn: Revenue" })).toBeTruthy();
  });
  it("uses the reply language for quiz correctness", () => {
    draw(fence("ong-ui", { type: "quiz", question: "2 + 2 = ?",
      options: ["3", "4"], answerIndex: 1 }), "vi");
    fireEvent.click(screen.getByRole("button", { name: "2. 4" }));
    expect(screen.getByRole("status").textContent).toContain("Chính xác");
  });
  it("recalculates bounded interactive expressions", () => {
    draw(fence("agent-ui", { type: "interactive", title: "QA calculator", parameters: [
      { id: "units", label: "Units", min: 1, max: 10, step: 1, initial: 2 },
    ], outputs: [{ label: "Total", expression: {
      op: "mul", args: [{ var: "units" }, 2],
    } }] }), "vi");
    fireEvent.change(screen.getByRole("slider", { name: "Units" }), { target: { value: "5" } });
    expect(screen.getByText("10")).toBeTruthy();
  });
  it("keeps 3D opt-in and iframe permissions separate", () => {
    const source = fence("agent-ui", { type: "scene3d", title: "Synthetic scene",
      viewerUrl: "/api/projects/qa/agent/files/scene.html" });
    draw(source);
    expect(screen.getByRole("status").textContent).toContain("3D preview unavailable");
    cleanup();
    draw(source, "en", true);
    fireEvent.click(screen.getByRole("button", { name: "Open 3D viewer" }));
    const frame = screen.getByTitle("Synthetic scene");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });
});
