import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright-core";
import { sensitiveScreenshotMask } from
  "../../lib/project-agent/runtime/browser-agent/privacy";

describe("browser screenshot privacy mask", () => {
  it("masks semantic secrets without hiding ordinary page controls", () => {
    const locator = vi.fn(() => "mask-locator");
    const page = { locator } as unknown as Page;

    expect(sensitiveScreenshotMask(page)).toBe("mask-locator");
    const selector = locator.mock.calls[0][0];
    const entries = selector.split(",");

    expect(entries).toContain('input[type="password" i]');
    expect(entries).toContain("[data-private]");
    expect(entries).toContain('[autocomplete*="cc-"]');
    expect(entries).not.toContain("input");
    expect(entries).not.toContain("textarea");
    expect(entries).not.toContain("select");
    expect(entries).not.toContain('[contenteditable="true"]');
  });
});
