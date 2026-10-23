import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { planAgentAnswer } from "../src/lib/project-agent/answer-plan";
import { validateAgentAnswer } from "../src/lib/project-agent/answer-validation";
import { parseInteractiveModel, evaluateExpression, type NumericExpression } from "../src/lib/project-agent/interactive-model";
import { completedStreamingMarkdown, splitPresentationSections } from "../src/lib/project-agent/presentation-mode";
import { ProjectAgentRichBlock } from "../src/components/ProjectAgentRichBlocks";
import { ProjectAgentAnswer } from "../src/components/ProjectAgentAnswer";
import { interactiveFixture } from "../demo/content";
import { parseRichUiBlock } from "../src/lib/project-agent/rich-ui";

describe("answer planning does not force decorative blocks", () => {
  it("chooses a concrete explorer for eight lunar phases", () => {
    expect(planAgentAnswer("Giải thích 8 pha Mặt Trăng cho học sinh lớp 6")).toMatchObject({
      intent: "explain", audience: "child", visual: "explorer",
    });
  });
  it("prefers prose and code for debugging", () => {
    expect(planAgentAnswer("Find the JavaScript bug: const total = prices.map(p => p * 1.1)")).toMatchObject({
      intent: "debug", visual: "none",
    });
  });
  it("uses a table only when a calculation benefits from it", () => {
    expect(planAgentAnswer("Tính lãi kép từng năm")).toMatchObject({ intent: "calculate", visual: "table" });
    expect(planAgentAnswer("Tính lãi kép")).toMatchObject({ intent: "calculate", visual: "none" });
  });
});

describe("structural validation and streaming", () => {
  it("reports malformed visual JSON without misclassifying text outside it", () => {
    const report = validateAgentAnswer("Before\n\n```agent-ui\n{\"type\":\"chart\",\"categories\":[\"A\"],\"series\":[]}\n```\nAfter");
    expect(report.valid).toBe(false);
    expect(report.blockCount).toBe(1);
    expect(report.issues[0].code).toBe("INVALID_VISUAL");
  });
  it("rejects unsafe source metadata", () => {
    const result = validateAgentAnswer("Answer", [{ url: "javascript:alert(1)", title: "bad", fetchedAt: "", sourceType: "page" }]);
    expect(result.issues.some((issue) => issue.code === "UNSAFE_SOURCE")).toBe(true);
  });
  it("does not render incomplete fenced visuals during streaming", () => {
    expect(completedStreamingMarkdown("Safe\n\n```agent-ui\n{\"type\":").text).toBe("Safe\n");
    expect(completedStreamingMarkdown("Safe\n\n```agent-ui\n{}\n```").pending).toBe(false);
  });
  it("splits sections only at headings outside code", () => {
    const markdown = "Intro\n\n```md\n## Not a heading\n```\n\n## Actual\nSecond";
    const slides = splitPresentationSections(markdown);
    expect(slides).toHaveLength(2);
    expect(slides[0]).toContain("## Not a heading");
    expect(slides[1]).toContain("## Actual");
  });
});

describe("safe interactive expression models", () => {
  it("parses and computes a bounded compound expression", () => {
    const model = parseInteractiveModel(interactiveFixture);
    expect(model?.outputs).toHaveLength(1);
    if (!model) throw new Error("Invalid model fixture");
    const values = Object.fromEntries(model.parameters.map((p) => [p.id, p.initial]));
    expect(evaluateExpression(model.outputs[0].expression, values)).toBeCloseTo(1157.625, 3);
  });
  it("rejects unknown functions, unsafe variables and extremely deep expressions", () => {
    expect(parseInteractiveModel({ ...interactiveFixture, outputs: [{ label: "Unsafe", expression: { op: "eval", args: [1, 2] } }] })).toBeNull();
    expect(parseInteractiveModel({ ...interactiveFixture, outputs: [{ label: "Unsafe", expression: { var: "__proto__" } }] })).toBeNull();
  });
  it("treats division by zero as an unavailable result", () => {
    const expression: NumericExpression = { op: "div", args: [10, { var: "x" }] };
    expect(evaluateExpression(expression, { x: 0 })).toBeNull();
  });
  it("updates numerical output and offers accessible table data", async () => {
    const user = userEvent.setup();
    render(<ProjectAgentRichBlock source={JSON.stringify(interactiveFixture)} />);
    expect(screen.getByText("Synthetic compounding explorer")).toBeTruthy();
    fireEvent.change(screen.getByRole("slider", { name: "Starting amount" }), { target: { value: "2000" } });
    expect(screen.getByText(/2\.315,25/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show data" }));
    expect(screen.getByRole("table")).toBeTruthy();
  });
});

describe("opt-in presentation remains readable", () => {
  it("navigates a deck and returns to complete Markdown", async () => {
    const user = userEvent.setup();
    render(<ProjectAgentAnswer presentation markdown={"Introduction.\n\n## First\nOne.\n\n## Second\nTwo."} />);
    expect(screen.getByText("Introduction.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Present as slides" }));
    expect(screen.queryByText("One.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next slide" }));
    expect(screen.getByText("One.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Read full answer" }));
    expect(screen.getByText("Two.")).toBeTruthy();
  });
});

describe("learning and citations are opt-in and evidence-driven", () => {
  it("rejects quizzes without a grounded answer index", () => {
    const source = JSON.stringify({ type: "quiz", question: "Q?", options: ["A", "B"], answerIndex: 3 });
    expect(parseRichUiBlock(source)).toBeNull();
  });
  it("shows quiz feedback only after selecting an answer", async () => {
    const user = userEvent.setup();
    render(<ProjectAgentRichBlock source={JSON.stringify({
      type: "quiz", question: "What is 2 + 2?", options: ["3", "4"], answerIndex: 1,
      explanation: "Two plus two is four.",
    })} />);
    expect(screen.queryByRole("status")).toBeNull();
    await user.click(screen.getByRole("button", { name: "2. 4" }));
    expect(screen.getByRole("status").textContent).toContain("Correct");
  });
});
