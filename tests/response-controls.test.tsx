import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectAgentAnswerActions } from "../src/components/ProjectAgentAnswerActions";
import { ProjectAgentMoreActions } from "../src/components/ProjectAgentMoreActions";
import { ProjectAgentCodeBlock } from "../src/components/ProjectAgentCodeBlocks";
import { ProjectAgentSources } from "../src/components/ProjectAgentSources";

// These are response-component tests; no model, app shell or runtime is involved.
describe("compact response actions", () => {
  it("does not invent host actions or an empty More disclosure", () => {
    render(<ProjectAgentAnswerActions markdown="A complete answer." />);
    expect(screen.getByRole("button", { name: "Copy response" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "More response actions" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Regenerate response" })).toBeNull();
  });
  it("keeps retry visible and puts save behind More, with Escape focus return", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async () => {});
    render(<ProjectAgentAnswerActions markdown="Answer" handlers={{ onRetry: vi.fn(), onSave: save }} />);
    expect(screen.getByRole("button", { name: "Regenerate response" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save response" })).toBeNull();
    const trigger = screen.getByRole("button", { name: "More response actions" });
    await user.click(trigger);
    const panel = screen.getByRole("dialog", { name: "More response actions" });
    expect(document.activeElement).toBe(within(panel).getByRole("button", { name: "Save response" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Save response" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("completed"));
  });
  it("shows an actual callback failure rather than a false success message", async () => {
    const user = userEvent.setup();
    render(<ProjectAgentAnswerActions markdown="Answer" handlers={{ onSave: async () => { throw new Error("Storage unavailable"); } }} />);
    await user.click(screen.getByRole("button", { name: "More response actions" }));
    await user.click(screen.getByRole("button", { name: "Save response" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Storage unavailable"));
  });
  it("supports arrow navigation past disabled items without trapping Tab", async () => {
    const user = userEvent.setup();
    render(<ProjectAgentMoreActions label="Options" items={[
      { id: "first", label: "First", icon: null, onSelect: vi.fn() },
      { id: "off", label: "Unavailable", icon: null, disabled: true, onSelect: vi.fn() },
      { id: "last", label: "Last", icon: null, onSelect: vi.fn() },
    ]} />);
    await user.click(screen.getByRole("button", { name: "Options" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Last" }));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
  });
});

describe("response code and sources", () => {
  it("keeps code copy and expand visible while line settings stay in a disclosure", async () => {
    const user = userEvent.setup();
    render(<ProjectAgentCodeBlock language="text" code="one\ntwo" />);
    expect(screen.getByRole("button", { name: "Copy code" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Expand code" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Wrap code lines" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "More code actions" }));
    const wrap = screen.getByRole("button", { name: "Wrap code lines" });
    expect(wrap.getAttribute("aria-pressed")).toBe("true");
    await user.click(wrap);
    expect(wrap.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("region", { name: "text code" }).getAttribute("data-wrap")).toBe("false");
  });
  it("summarizes distinct source hosts without loading icons from remote domains", () => {
    const { container } = render(<ProjectAgentSources sources={[
      { url: "https://example.com/a", title: "A", fetchedAt: "", sourceType: "page" },
      { url: "https://example.com/b", title: "B", fetchedAt: "", sourceType: "page" },
      { url: "javascript:alert(1)", title: "Unsafe", fetchedAt: "", sourceType: "page" },
    ]} />);
    expect(container.querySelectorAll(".agent-source-identity")).toHaveLength(1);
    expect(container.querySelector(".agent-sources-count")?.textContent).toBe("2");
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
    expect(container.querySelector("img")).toBeNull();
  });
});
