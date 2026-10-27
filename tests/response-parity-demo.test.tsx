import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProjectAgentAnswer } from "../src/components/ProjectAgentAnswer";

const fence = (tag: "ong-ui" | "agent-ui", block: unknown) =>
  ["```" + tag, JSON.stringify(block), "```"].join("\n");
beforeEach(() => vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("demo: host blocks and localization parity", () => {
  it("accepts ong-ui legacy blocks and uses Japanese quiz labels", () => {
    render(<ProjectAgentAnswer language="ja" markdown={fence("ong-ui", {
      type: "quiz", question: "2 + 2 = ?", options: ["3", "4"], answerIndex: 1,
    })} />);
    fireEvent.click(screen.getByRole("button", { name: "2. 4" }));
    expect(screen.getByRole("status").textContent).toContain("正解");
  });
  it("recalculates interactive outputs without executing code", () => {
    render(<ProjectAgentAnswer language="en" markdown={fence("agent-ui", {
      type: "interactive", title: "Demo calculator", parameters: [
        { id: "units", label: "Units", min: 1, max: 10, step: 1, initial: 2 },
      ], outputs: [{ label: "Total", expression: {
        op: "mul", args: [{ var: "units" }, 2],
      } }],
    })} />);
    fireEvent.change(screen.getByRole("slider", { name: "Units" }), { target: { value: "4" } });
    expect(screen.getByText("8")).toBeTruthy();
  });
});
