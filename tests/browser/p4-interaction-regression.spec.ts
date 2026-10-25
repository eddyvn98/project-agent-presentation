import { test, expect } from "@playwright/test";

test.describe("P4 Presentation Lab interactive regression", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/"); });

  test("all eight states remain synchronized through forward and reverse navigation", async ({ page }) => {
    const explorer = page.getByRole("region", { name: /Eight states in a fictional cycle/ });
    const next = explorer.getByRole("button", { name: "Next", exact: true });
    const previous = explorer.getByRole("button", { name: "Previous", exact: true });
    const slider = explorer.getByRole("slider");
    const selector = explorer.getByRole("combobox");
    await expect(previous).toBeDisabled();
    for (let state = 1; state <= 8; state++) {
      await expect(explorer.getByRole("heading", { name: `Position ${state}` })).toBeVisible();
      await expect(slider).toHaveValue(String(state - 1));
      await expect(slider).toHaveAttribute("aria-valuetext", `State ${state}`);
      await expect(selector).toHaveValue(String(state - 1));
      if (state < 8) await next.click();
    }
    await expect(next).toBeDisabled();
    for (let state = 7; state >= 1; state--) {
      await previous.click();
      await expect(explorer.getByRole("heading", { name: `Position ${state}` })).toBeVisible();
    }
    await selector.selectOption("4");
    await expect(explorer.getByRole("heading", { name: "Position 5" })).toBeVisible();
    await slider.focus();
    await page.keyboard.press("End");
    await expect(explorer.getByRole("heading", { name: "Position 8" })).toBeVisible();
    await page.keyboard.press("Home");
    await expect(previous).toBeDisabled();
  });

  test("390px Mermaid preview and zoom remain usable without body overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const trigger = page.getByRole("button", { name: "Enlarge Diagram", exact: true }).first();
    await expect(trigger).toBeVisible({ timeout: 30000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const preview = page.getByRole("region", { name: "Diagram, scroll to explore" });
    const previewBounds = await preview.boundingBox();
    expect(previewBounds).not.toBeNull();
    expect(previewBounds!.width).toBeLessThanOrEqual(390);
    await trigger.click();
    const dialog = page.getByRole("dialog");
    const diagram = dialog.getByRole("img", { name: "Diagram", exact: true });
    const before = await diagram.boundingBox();
    await dialog.getByRole("button", { name: "Zoom in diagram" }).click();
    await expect(dialog.locator("output")).toHaveText("125%");
    expect((await diagram.boundingBox())!.width).toBeGreaterThan(before!.width * 1.2);
    await expect(dialog.getByRole("region", { name: "Diagram, scrollable enlarged diagram" })).toBeVisible();
    await dialog.getByRole("button", { name: "Reset" }).click();
    await expect(dialog.locator("output")).toHaveText("100%");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("citation Enter, Tab, Escape and return-focus are keyboard accessible", async ({ page }) => {
    const trigger = page.getByRole("button", { name: /Show source:/ }).first();
    const dialog = page.getByRole("dialog");
    const close = dialog.getByRole("button", { name: "Close source details" });
    await test.step("first open: Enter, Tab, Tab and focus wrapping", async () => {
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("link", { name: "Open source" })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("link", { name: "Open source" })).toBeFocused();
    });
    await test.step("Escape: trigger focus AND onscreen anchor restored", async () => {
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      const anchor = await trigger.evaluate(element => {
        const { y, height } = element.getBoundingClientRect();
        return { y, height, scrollY, viewportHeight: innerHeight };
      });
      console.log("P4 citation after Escape:", JSON.stringify(anchor));
      await expect(trigger).toBeInViewport();
    });
    await test.step("second Enter: anchored popover and Close in viewport", async () => {
      await page.keyboard.press("Enter");
      await expect(dialog).toBeVisible();
    // Capture BEFORE Playwright tries to scroll into view. Record the popper
    // wrapper as well: Content can be visible while the positioned Close is not.
    const geometry = await dialog.evaluate((content) => {
      const rect = (element: Element | null) => {
        if (!element) return null;
        const { x, y, width, height, top, right, bottom, left } = element.getBoundingClientRect();
        return { x, y, width, height, top, right, bottom, left };
      };
      const trigger = document.querySelector('button[aria-label^="Show source:"]');
      const closeButton = content.querySelector('button[aria-label="Close source details"]');
      const wrapper = content.closest('[data-radix-popper-content-wrapper]');
      const style = (element: Element | null) => {
        if (!element) return null;
        const computed = getComputedStyle(element);
        return { position: computed.position, transform: computed.transform,
          overflow: computed.overflow, maxHeight: computed.maxHeight };
      };
      return {
        viewport: { width: innerWidth, height: innerHeight,
          visualWidth: visualViewport?.width ?? null,
          visualHeight: visualViewport?.height ?? null },
        scroll: { x: scrollX, y: scrollY },
        activeElement: document.activeElement?.getAttribute("aria-label") ??
          document.activeElement?.tagName ?? null,
        trigger: rect(trigger), content: rect(content), close: rect(closeButton),
        wrapper: rect(wrapper),
        contentStyle: style(content), wrapperStyle: style(wrapper),
        placement: content.getAttribute("data-side"),
      };
    });
      console.log("P4 citation second-open geometry:", JSON.stringify(geometry));
      await expect(trigger, JSON.stringify(geometry, null, 2)).toBeInViewport();
      await expect(dialog, JSON.stringify(geometry, null, 2)).toBeInViewport();
      await expect(close, JSON.stringify(geometry, null, 2)).toBeInViewport();
    });
    await test.step("pointer Close: dismiss and return visible trigger focus", async () => {
      await close.click({ timeout: 7000 });
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(trigger).toBeInViewport();
    });
  });

  test("abnormal chart data has nonblank fallback and surrounding text", async ({ page }) => {
    await expect(page.getByText("Visual unavailable. Continue with the accompanying explanation.")).toBeVisible();
    await expect(page.getByText("The explanation remains visible when optional visual data is malformed:")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sources and graceful fallback" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
