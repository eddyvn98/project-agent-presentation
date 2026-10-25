import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectAgentRichBlock } from "../src/components/ProjectAgentRichBlocks";
import { ProjectAgentAnswer } from "../src/components/ProjectAgentAnswer";
import { parseRichUiBlock } from "../src/lib/project-agent/rich-ui";
import { safeProject3DViewerUrl } from "../src/lib/project-agent/scene3d-policy";

const valid = "/api/projects/qa_synthetic/agent/files/scene.html";
const source = JSON.stringify({ type: "scene3d", title: "Synthetic room",
  caption: "3D reconstruction", viewerUrl: valid });

describe("safe click-to-load 3D presentation", () => {
  it("is disabled by default until host opts into safe 3D asset serving", () => {
    const { container } = render(<ProjectAgentRichBlock source={source} />);
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open 3D viewer" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Visual unavailable");
  });
  it("does not load executable HTML until the user explicitly opens it", async () => {
    const user = userEvent.setup();
    const { container } = render(<ProjectAgentRichBlock source={source} enable3DViewer />);
    expect(screen.getByText("Synthetic room")).toBeTruthy();
    expect(container.querySelector("iframe")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open 3D viewer" }));
    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe(valid);
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(iframe?.getAttribute("sandbox")).not.toContain("allow-same-origin");
    await user.click(screen.getByRole("button", { name: "Close 3D viewer" }));
    expect(container.querySelector("iframe")).toBeNull();
  });
  it("threads host opt-in through the actual Markdown agent-ui rendering path", async () => {
    const markdown = "Before\\n\\n\`\`\`agent-ui\\n" + source + "\\n\`\`\`\\n\\nAfter";
    const { container, rerender } = render(<ProjectAgentAnswer markdown={markdown} />);
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open 3D viewer" })).toBeNull();
    rerender(<ProjectAgentAnswer markdown={markdown} enable3DViewer />);
    expect(screen.getByRole("button", { name: "Open 3D viewer" })).toBeTruthy();
    expect(screen.getByText("After")).toBeTruthy();
  });
  it("rejects external, encoded, scripting and traversal viewer URLs", () => {
    expect(safeProject3DViewerUrl(valid)).toBe(valid);
    for (const url of ["https://superspl.at/editor", "javascript:alert(1)",
      "//evil.test/file", "/api/projects/qa/agent/files/../secret.html",
      "/api/projects/qa/agent/files/%2e%2e.html",
      "/api/projects/qa/agent/files/scene.html?token=secret",
      "/api/projects/qa/agent/files/scene.zip", "/logout"]) {
      expect(safeProject3DViewerUrl(url)).toBeNull();
      expect(parseRichUiBlock(JSON.stringify({ type: "scene3d",
        title: "Bad", viewerUrl: url }))).toBeNull();
    }
  });
  it("parses only an explicit complete host viewer without inventing 3D data", () => {
    expect(parseRichUiBlock(source)).toEqual({ type: "scene3d",
      title: "Synthetic room", caption: "3D reconstruction", viewerUrl: valid });
    expect(parseRichUiBlock(JSON.stringify({ type: "scene3d",
      viewerUrl: valid }))).toBeNull();
  });
});
