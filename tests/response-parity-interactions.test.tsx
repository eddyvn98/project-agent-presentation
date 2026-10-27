import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProjectAgentTaskAnswer } from "../components/features/projects/ProjectAgentTaskAnswer";
import { ProjectAgentAnswer } from "../src/components/ProjectAgentAnswer";

const block = (fence: "ong-ui" | "agent-ui", value: unknown) =>
  ["```" + fence, JSON.stringify(value), "```"].join("\n");
const host = (source: string, language: "vi" | "en" | "ja" = "en", enable3DViewer = false) =>
  render(<ProjectAgentTaskAnswer markdown={source} language={language} sources={[]}
    resolveImage={() => null} enable3DViewer={enable3DViewer} />);
const demo = (source: string, language = "en") =>
  render(<ProjectAgentAnswer markdown={source} language={language} />);

beforeEach(() => vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const quiz = { type: "quiz", question: "2 + 2 = ?", options: ["3", "4"], answerIndex: 1 };
const model = { type: "interactive", title: "Synthetic calculator", parameters: [
  { id: "units", label: "Units", min: 1, max: 10, step: 1, initial: 2 },
], outputs: [{ label: "Total", expression: { op: "mul", args: [{ var: "units" }, 2] } }] };

describe("Host and demo rich-response interaction parity", () => {
  it("host accepts historical demo fence and localizes chart controls and exact figures", () => {
    host(block("agent-ui", { type: "chart", kind: "line", title: "Revenue",
      categories: ["Jan", "Feb"], series: [{ name: "Sales", values: [1234.5, 1500] }] }), "vi");
    fireEvent.click(screen.getByRole("button", { name: "Bảng" }));
    expect(screen.getByRole("table").textContent).toContain("1.234,5");
    expect(screen.getByRole("columnheader", { name: "Danh mục" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Biểu đồ" }));
    expect(screen.getByRole("region", { name: "Biểu đồ có thể cuộn: Revenue" })).toBeTruthy();
  });

  it("both surfaces support quiz buttons, preserving the chosen response language", () => {
    host(block("ong-ui", quiz), "vi");
    fireEvent.click(screen.getByRole("button", { name: "2. 4" }));
    expect(screen.getByRole("status").textContent).toContain("Chính xác");
    cleanup();
    demo(block("ong-ui", quiz), "ja");
    fireEvent.click(screen.getByRole("button", { name: "2. 4" }));
    expect(screen.getByRole("status").textContent).toContain("正解");
  });

  it("both surfaces recalculate a bounded slider rather than running supplied scripts", () => {
    host(block("agent-ui", model), "vi");
    const range = screen.getByRole("slider", { name: "Units" });
    expect(range).toBeTruthy();
    fireEvent.change(range, { target: { value: "5" } });
    expect(screen.getByText("10")).toBeTruthy();
    cleanup();
    demo(block("ong-ui", model), "en");
    const second = screen.getByRole("slider", { name: "Units" });
    fireEvent.change(second, { target: { value: "4" } });
    expect(screen.getByText("8")).toBeTruthy();
  });

  it("host leaves 3D disabled unless explicitly opted in and never grants same-origin iframe rights", () => {
    const scene = block("agent-ui", { type: "scene3d", title: "Synthetic scene",
      viewerUrl: "/api/projects/qa/agent/files/scene.html" });
    host(scene);
    expect(screen.getByRole("status").textContent).toContain("3D preview unavailable");
    cleanup();
    host(scene, "en", true);
    fireEvent.click(screen.getByRole("button", { name: "Open 3D viewer" }));
    const frame = screen.getByTitle("Synthetic scene");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
  });
});
