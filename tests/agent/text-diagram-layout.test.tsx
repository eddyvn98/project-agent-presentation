import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ProjectAgentCodeBlock } from "../../components/features/projects/ProjectAgentCodeBlocks";

afterEach(cleanup);
describe("host text diagram layout", () => {
  it("preserves monospaced box-drawing columns with no wrapping", () => {
    const diagram = "┌─────────────────┐      ┌──────────────────┐\\n" +
      "│ Planning        │ ──▶  │ Execution        │\\n" +
      "└─────────────────┘      └──────────────────┘";
    const { container } = render(<ProjectAgentCodeBlock language="text" code={diagram} />);
    const pre = container.querySelector("pre")!;
    expect(pre.className).toContain("whitespace-pre");
    expect(pre.className).not.toContain("break-words");
    expect(pre.style.fontVariantLigatures).toBe("none");
    expect(pre.textContent).toBe(diagram);
  });
});
