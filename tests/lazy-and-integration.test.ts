import { describe, expect, it } from "vitest";
import { containsMathMarkdown } from "../src/lib/project-agent/math-detection";
import { createAgentPresentationContext, reviewAgentPresentation } from "../src/lib/project-agent/agent-integration";

describe("conditional math loading", () => {
  it("detects inline and display formulas", () => {
    expect(containsMathMarkdown("The area is $a^2+b^2$ square units.")).toBe(true);
    expect(containsMathMarkdown("Before\n\n$$\nE=mc^2\n$$")).toBe(true);
  });
  it("ignores code samples, fenced math strings and escaped currency", () => {
    expect(containsMathMarkdown("Literal \\$5 and `$x$`.")).toBe(false);
    expect(containsMathMarkdown("Example:\n\n```js\nconst code = '$x$';\n```")).toBe(false);
    expect(containsMathMarkdown("The answer is prose only.")).toBe(false);
  });
});
describe("provider-independent agent integration contract", () => {
  it("provides a plan without forcing rich blocks on code questions", () => {
    const context = createAgentPresentationContext("Fix a JavaScript TypeError", { includeVisualSchema: true });
    expect(context.plan.visual).toBe("none");
    expect(context.instructions).not.toContain("RICH ANSWER BLOCKS");
  });
  it("allows visual instructions when justified and explicitly requested by the host", () => {
    const context = createAgentPresentationContext("Explain 8 phases of the Moon", { includeVisualSchema: true });
    expect(context.plan.visual).toBe("explorer");
    expect(context.instructions).toContain("RICH ANSWER BLOCKS");
  });
  it("prevents publication of malformed visual blocks", () => {
    const review = reviewAgentPresentation('Read this.\n\n```agent-ui\n{"type":"unknown"}\n```');
    expect(review.readyToPublish).toBe(false);
    expect(review.report.issues[0].code).toBe("INVALID_VISUAL");
  });
  it("does not publish an unfinished response while streaming", () => {
    const review = reviewAgentPresentation("Complete paragraph.\n\n```agent-ui\n{", [], true);
    expect(review.pending).toBe(true);
    expect(review.completedMarkdown.trim()).toBe("Complete paragraph.");
    expect(review.readyToPublish).toBe(false);
  });
  it("accepts completed prose without any visual", () => {
    expect(reviewAgentPresentation("A brief complete answer.").readyToPublish).toBe(true);
  });
});
