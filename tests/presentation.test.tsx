import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectAgentAnswer } from "../src/components/ProjectAgentAnswer";
import { ProjectAgentFigure, safePresentationUrl } from "../src/components/ProjectAgentFigure";
import * as ExplorerModule from "../src/components/ProjectAgentExplorer";
import { ProjectAgentExplorer } from "../src/components/ProjectAgentExplorer";
import { ProjectAgentSourceLink } from "../src/components/ProjectAgentSourceLink";
import { ProjectAgentRichBlock } from "../src/components/ProjectAgentRichBlocks";
import { parseRichUiBlock } from "../src/lib/project-agent/rich-ui";
import { resolveInlineImage } from "../src/components/projectAgentInlineImages";
import { explorer } from "../demo/content";

const chart = (values: unknown[]) => JSON.stringify({ type: "chart", categories: ["A", "B"], series: [{ name: "Synthetic", values }] });

describe("safe and complete Markdown", () => {
  it("renders inline/display math with accessible MathML, leaving code literal", async () => {
    const { container } = render(<ProjectAgentAnswer markdown={'Inline $x^2$.\n\n$$\na^2+b^2=c^2\n$$\n\n`$x$`'} />);
    await waitFor(() => expect(container.querySelectorAll(".katex").length).toBe(2));
    expect(container.querySelectorAll("math").length).toBe(2);
    expect(container.querySelector(".katex-display")).not.toBeNull();
    expect(container.querySelector("code")?.textContent).toBe("$x$");
  });
  it("shows unsupported TeX visibly and disables trusted HTML macros", () => {
    const { container } = render(<ProjectAgentAnswer markdown={String.raw`$\badCommand{x}$ $\href{javascript:alert(1)}{click}$`} />);
    expect(container.textContent).toContain("\\badCommand");
    expect(container.querySelector('[href^="javascript:"]')).toBeNull();
  });
  it("drops raw HTML, executable links and unsafe image URLs", () => {
    const { container } = render(<ProjectAgentAnswer markdown={'Before\n\n<script>alert(1)</script>\n\n[bad](javascript:alert) ![bad](data:image/svg+xml,test)\n\nAfter'} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[href^="javascript:"]')).toBeNull();
    expect(container.textContent).toContain("After");
  });
  it("keeps figures in place without nested paragraphs or image links", () => {
    const { container } = render(<ProjectAgentAnswer markdown={'Before\n\n[![Test](/test.png)](https://example.com)\n\nAfter'} />);
    expect(container.querySelector("p figure, a button")).toBeNull();
    expect(container.querySelectorAll("figure").length).toBe(1);
    expect(container.textContent).toMatch(/Before.*Test.*After/s);
  });
  it("preserves prose around malformed optional visuals", () => {
    render(<ProjectAgentAnswer markdown={'Before\n\n```agent-ui\n{"type":"unknown"}\n```\n\nAfter'} />);
    expect(screen.getByText("Before")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Visual unavailable");
    expect(screen.getByText("After")).toBeTruthy();
  });
});

describe("figures and adapter compatibility", () => {
  it.each(["javascript:alert(1)", "data:image/svg+xml,test", "//untrusted.test/a", "https:\\evil.test", "java\nscript:test"])("rejects unsafe URL %s", (url) => {
    expect(safePresentationUrl(url)).toBe(false);
  });
  it("uses explicit size/caption/source metadata without inventing attribution", () => {
    const { container } = render(<ProjectAgentFigure src="/a.png" alt="Accessible label" presentation={{ size: "inline", caption: "Short caption", source: { url: "https://example.com", label: "Synthetic" } }} />);
    expect(container.querySelector("figure")?.dataset.size).toBe("inline");
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://example.com");
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("status").textContent).toContain("Accessible label");
    expect(screen.getByText(/Short caption/)).toBeTruthy();
  });
  it("opens, zooms, resets and returns focus after closing", async () => {
    const user = userEvent.setup();
    render(<ProjectAgentFigure src="/a.png" alt="Marker" />);
    const trigger = screen.getByRole("button", { name: "Enlarge Marker" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Zoom in image" }));
    expect(screen.getByRole("dialog").textContent).toContain("150%");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("dialog").textContent).toContain("100%");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("honors an existing local file resolver and handles malformed filenames", () => {
    const resolve = vi.fn(() => "/resolved.png");
    render(<ProjectAgentAnswer markdown="![Local](outputs/local.png)" resolveImage={resolve} />);
    expect(screen.getByRole("img").getAttribute("src")).toBe("/resolved.png");
    expect(resolveInlineImage("%broken.png", [], () => "/file")).toBeNull();
  });
});

describe("data fidelity and explorers", () => {
  it.each([[1], [1, null], [1, "bad"], [1, "12kg"], [1, ""], [1, 2, 3], [1, "9".repeat(400)]])("rejects incomplete/non-numeric chart values %j", (...values) => {
    expect(parseRichUiBlock(chart(values))).toBeNull();
  });
  it("preserves genuine zero values", () => {
    expect(parseRichUiBlock(chart([0, 2]))).toMatchObject({ series: [{ values: [0, 2] }] });
  });
  it("navigates all eight states and enlarges scenes", async () => {
    const block = parseRichUiBlock(JSON.stringify(explorer));
    if (block?.type !== "explorer") throw new Error("Invalid fixture");
    const user = userEvent.setup();
    render(<ProjectAgentExplorer block={block} />);
    expect(screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")).toBe(true);
    await user.selectOptions(screen.getByRole("combobox"), "7");
    expect(screen.getByRole("heading", { name: "Position 8" })).toBeTruthy();
    expect(screen.getByRole("slider").getAttribute("aria-valuetext")).toBe("State 8");
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Enlarge Position 8 scene" }));
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("dialog").textContent).toContain("125%");
  });
  it("contains a visual render exception without losing surrounding prose", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = vi.spyOn(ExplorerModule, "ProjectAgentExplorer").mockImplementation(() => { throw new Error("Synthetic render failure"); });
    try {
      render(<ProjectAgentAnswer markdown={'Before\n\n```agent-ui\n' + JSON.stringify(explorer) + '\n```\n\nAfter'} />);
      expect(screen.getByRole("status").textContent).toContain("Visual unavailable");
      expect(screen.getByText("After")).toBeTruthy();
    } finally { broken.mockRestore(); error.mockRestore(); }
  });
  it("recovers from invalid visual JSON when valid content arrives", () => {
    const { rerender } = render(<ProjectAgentRichBlock source="{" />);
    expect(screen.getByRole("status")).toBeTruthy();
    rerender(<ProjectAgentRichBlock source={'{"type":"callout","text":"Recovered"}'} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Recovered")).toBeTruthy();
  });
});

it("citation popover supports keyboard focus, Escape and safe links", async () => {
  const user = userEvent.setup();
  render(<ProjectAgentSourceLink href="https://example.com" host="example.com" label="Source" title="Synthetic reference" />);
  const trigger = screen.getByRole("button");
  trigger.focus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("link", { name: "Open source" }));
  expect(screen.getByRole("link").getAttribute("rel")).toBe("noopener noreferrer");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
