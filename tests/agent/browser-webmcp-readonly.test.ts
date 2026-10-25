import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserSession } from "../../lib/project-agent/runtime/browser-agent/session";
import { inspectWebMcpScene, webMcpSceneAllowed } from
  "../../lib/project-agent/runtime/browser-agent/webmcp-readonly";
import { parseBrowserAction } from "../../lib/project-agent/runtime/browser-agent/action-parser";
import { runP8BrowserLoopStep } from "../../lib/project-agent/runtime/browser-agent/loop-step";
import { browserLoopStatus, clearBrowserLoop } from "../../lib/project-agent/runtime/browser-agent/loop-state";

const origin = "https://superspl.at", task = "pat_aabbccddeeff";
const env = { PROJECT_AGENT_BROWSER_WEBMCP_READONLY: "1",
  PROJECT_AGENT_BROWSER_WEBMCP_ORIGINS: origin } as NodeJS.ProcessEnv;
const savedContext = Object.getOwnPropertyDescriptor(document, "modelContext");
function fakeSession(url = origin + "/editor") {
  return { page: { url: () => url,
    evaluate: vi.fn(async (callback: () => Promise<unknown>) => callback()) },
    lastSnapshot: "" } as unknown as BrowserSession;
}
function supplyContext(tools: { name: string }[], reply: unknown) {
  const executeTool = vi.fn(async () => reply);
  Object.defineProperty(document, "modelContext", {
    configurable: true, value: { getTools: vi.fn(async () => tools), executeTool },
  });
  return executeTool;
}
afterEach(() => {
  vi.unstubAllEnvs();
  clearBrowserLoop(task);
  if (savedContext) Object.defineProperty(document, "modelContext", savedContext);
  else Reflect.deleteProperty(document, "modelContext");
});
describe("SuperSplat native WebMCP read-only scene contract", () => {
  it("defaults OFF, rejects remote origins and URL tricks", () => {
    expect(webMcpSceneAllowed(origin + "/editor")).toBe(false);
    expect(webMcpSceneAllowed(origin + "/editor", env)).toBe(true);
    for (const url of ["https://evil.test/editor",
      "https://superspl.at.evil.test/editor", "javascript:alert(1)",
      "https://u:p@superspl.at/editor", origin + "/editor#evil"]) {
      expect(webMcpSceneAllowed(url, env)).toBe(false);
    }
    expect(webMcpSceneAllowed("http://localhost:3000/editor", {
      ...env, PROJECT_AGENT_BROWSER_WEBMCP_ORIGINS: "http://localhost:3000",
    })).toBe(true);
    expect(webMcpSceneAllowed("http://evil.test/editor", {
      ...env, PROJECT_AGENT_BROWSER_WEBMCP_ORIGINS: "http://evil.test",
    })).toBe(false);
  });
  it("passes no model args and never invokes destructive WebMCP tools", async () => {
    const execute = supplyContext([{ name: "delete_selection" }, { name: "get_scene" }],
      JSON.stringify({ ok: true, layerCount: 2 }));
    const result = await inspectWebMcpScene(fakeSession(), env);
    expect(result.failed).toBeUndefined();
    expect(result.text).toContain("layerCount");
    expect(result.text).toContain("untrusted page data");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ name: "get_scene" }, {});
  });
  it("handles unsupported WebMCP and a failed scene tool safely", async () => {
    const unsupported = await inspectWebMcpScene(fakeSession(), env);
    expect(unsupported.failed).toBe(true);
    expect(unsupported.text).toContain("unavailable");
    supplyContext([{ name: "get_scene" }], JSON.stringify({
      ok: false, error: { code: "operation_failed" },
    }));
    const result = await inspectWebMcpScene(fakeSession(), env);
    expect(result.failed).toBe(true);
  });
  it("supports parsed inspect_scene without assigning false no-progress events", async () => {
    const parsed = parseBrowserAction({ op: "inspect_scene" });
    expect("error" in parsed).toBe(false);
    vi.stubEnv("PROJECT_AGENT_P8_LOOP", "1");
    const execute = vi.fn(async () => ({ text: "Read-only scene" }));
    const input = { action: "browser", op: "inspect_scene" } as const;
    const result = await runP8BrowserLoopStep(task, fakeSession(), input, undefined, execute);
    expect(result.text).toBe("Read-only scene");
    expect(execute).toHaveBeenCalledOnce();
    expect(browserLoopStatus(task)).toBeNull();
  });
});
