import { afterEach, describe, expect, it, vi } from "vitest";
import type { Page } from "playwright-core";
import { browserWatchImage, browserWatchStatus, captureBrowserWatch, finishBrowserWatch, setBrowserWatch } from "../../lib/project-agent/runtime/browser-agent/watch";
import { parseRuntimeAction } from "../../lib/project-agent/runtime/actions";
import { denyReason } from "../../lib/project-agent/runtime/policy";
import { requiresUserConfirmation } from "../../lib/project-agent/runtime/browser-agent/safety";

const TASK = "pat_123456789abc";
afterEach(() => { setBrowserWatch(TASK, false); vi.restoreAllMocks(); });

function fakePage() {
  const locator = { count: vi.fn(async () => 0) };
  const screenshot = vi.fn(async () => Buffer.from([255, 216, 255, 217]));
  const page = { screenshot, locator: vi.fn(() => locator), url: () => "https://shop.example.test/order?token=secret#section" } as unknown as Page;
  return { page, screenshot };
}

describe("opt-in private browser viewer", () => {
  it("captures no browser frames without a user opt-in, and retains no frames after opt-out", async () => {
    const { page, screenshot } = fakePage();
    await captureBrowserWatch(TASK, page, "open");
    expect(screenshot).not.toHaveBeenCalled();
    setBrowserWatch(TASK, true);
    await captureBrowserWatch(TASK, page, "click");
    expect(screenshot).toHaveBeenCalledWith(expect.objectContaining({
      type: "jpeg", maskColor: "#64748b", timeout: 4_000,
    }));
    expect(browserWatchStatus(TASK)).toMatchObject({
      watching: true, sequence: 1, location: "https://shop.example.test",
      action: "click", hasImage: true,
      history: [expect.objectContaining({ location: "https://shop.example.test" })],
    });
    expect(JSON.stringify(browserWatchStatus(TASK))).not.toContain("/order");
    expect(browserWatchImage(TASK)?.byteLength).toBe(4);
    setBrowserWatch(TASK, false);
    expect(browserWatchImage(TASK)).toBeNull();
    expect(browserWatchStatus(TASK)).toBeNull();
  });
  it("stops new frames on task closure and never exposes query secrets in status", async () => {
    const { page, screenshot } = fakePage();
    setBrowserWatch(TASK, true);
    await captureBrowserWatch(TASK, page, "type");
    finishBrowserWatch(TASK);
    await captureBrowserWatch(TASK, page, "scroll");
    expect(screenshot).toHaveBeenCalledTimes(1);
    expect(browserWatchStatus(TASK)?.finished).toBe(true);
    expect(JSON.stringify(browserWatchStatus(TASK))).not.toContain("token=secret");
  });
});

describe("safe visual browser operations", () => {
  it("validates new tab, drag and staged upload operations", () => {
    expect(parseRuntimeAction('{"action":"browser","op":"new_tab","url":"https://example.test"}')).toMatchObject({ op: "new_tab" });
    expect(parseRuntimeAction('{"action":"browser","op":"switch_tab","tabIndex":2}')).toMatchObject({ tabIndex: 2 });
    expect(parseRuntimeAction('{"action":"browser","op":"switch_tab","tabIndex":12}')).toHaveProperty("error");
    expect(parseRuntimeAction('{"action":"browser","op":"drag","ref":"e1"}')).toHaveProperty("error");
    expect(parseRuntimeAction('{"action":"browser","op":"drag","ref":"e1","targetRef":"e2"}')).toMatchObject({ op: "drag" });
    expect(parseRuntimeAction('{"action":"browser","op":"upload","ref":"e4","path":"/etc/passwd"}')).toHaveProperty("error");
    expect(parseRuntimeAction('{"action":"browser","op":"upload","ref":"e4","path":"/work/inputs/file.pdf"}')).toMatchObject({ op: "upload" });
  });
  it("keeps reviewers read-only, and uploading requires explicit destination authorization", () => {
    expect(denyReason({ readOnly: true }, { action: "browser", op: "upload", ref: "e2", path: "/work/inputs/a.pdf" })).toMatch(/read-only/i);
    expect(denyReason({ readOnly: true }, { action: "browser", op: "switch_tab", tabIndex: 0 })).toBeNull();
    expect(requiresUserConfirmation("upload", "Research the example.com website", "example.com")).toBe(true);
    expect(requiresUserConfirmation("upload", "Upload file to example.com", "example.com")).toBe(false);
  });
});
