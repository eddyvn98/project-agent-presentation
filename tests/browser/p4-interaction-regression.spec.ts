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
    const preview = page.getByRole("region", { name: "Diagram, scroll to explore", exact: true });
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
    await test.step("first open: Enter and Tab focus cycle", async () => {
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("link", { name: "Open source" })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("link", { name: "Open source" })).toBeFocused();
    });
    await test.step("Escape: trigger focus and viewport restoration", async () => {
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
    await test.step("second Enter: anchor, popover and Close within viewport", async () => {
      await page.keyboard.press("Enter");
      await expect(dialog).toBeVisible();
      // Observe layout before actionability auto-scrolling changes the evidence.
      const geometry = await dialog.evaluate(content => {
        const rect = (element: Element | null) => {
          if (!element) return null;
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        };
        const trigger = document.querySelector('button[aria-label^="Show source:"]');
        const button = content.querySelector('button[aria-label="Close source details"]');
        const wrapper = content.closest('[data-radix-popper-content-wrapper]');
        return { viewport: { width: innerWidth, height: innerHeight }, scrollY,
          active: document.activeElement?.tagName ?? null,
          trigger: rect(trigger), content: rect(content), close: rect(button),
          wrapper: rect(wrapper), placement: content.getAttribute("data-side"),
          wrapperTransform: wrapper ? getComputedStyle(wrapper).transform : null };
      });
      console.log("P4 citation second-open geometry:", JSON.stringify(geometry));
      await expect(trigger, JSON.stringify(geometry)).toBeInViewport();
      await expect(dialog, JSON.stringify(geometry)).toBeInViewport();
      await expect(close, JSON.stringify(geometry)).toBeInViewport();
    });
    await test.step("pointer Close: dismiss and return focus", async () => {
      await close.click({ timeout: 7000 });
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(trigger).toBeInViewport();
    });
  });

  test("citation keyboard reopen from offscreen focused trigger reanchors popup", async ({ page }) => {
    const trigger = page.getByRole("button", { name: /Show source:/ }).first();
    const dialog = page.getByRole("dialog");
    const close = dialog.getByRole("button", { name: "Close source details" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    // Exercise close as well as reopen when the currently focused anchor
    // is offscreen. This reproduces the measured Escape failure directly.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(trigger).not.toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toBeInViewport();

    // A delayed browser scroll AFTER Escape must not strand focused keyboard
    // users. This exercises the measured y=890/scrollY=2102 failure class.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(trigger).toBeInViewport();
    // After focus moves away, the close guard must stop. Reproduce a genuinely
    // offscreen focused trigger to retain the existing reopen regression.
    await trigger.evaluate(element => (element as HTMLElement).blur());
    await trigger.focus();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(trigger).not.toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await expect(trigger).toBeInViewport();
    await expect(dialog).toBeInViewport();
    await expect(close).toBeInViewport();
    await close.click({ timeout: 7000 });
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("abnormal chart data has nonblank fallback and surrounding text", async ({ page }) => {
    await expect(page.getByText("Visual unavailable. Continue with the accompanying explanation.")).toBeVisible();
    await expect(page.getByText("The explanation remains visible when optional visual data is malformed:")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sources and graceful fallback" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
