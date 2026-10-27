import { test, expect } from "@playwright/test";
import { mockAgentApi } from "./fixtures.mjs";
const views = ["skills", "workflows", "schedules", "settings", "sessions"];
const overflow = page => page.evaluate(() =>
  Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) > innerWidth + 2);
test("reflow at 320, 390, 768 and 1280 CSS px with all five Agent surfaces", async ({ page }) => {
  await mockAgentApi(page);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 880 });
    for (const view of views) {
      await page.goto("/agent-ui-qa.html?view=" + view);
      await expect(page.locator("[data-agent-ui-qa=" + view + "]")).toBeVisible();
      await expect.poll(() => overflow(page), { message: view + " overflow at " + width }).toBe(false);
      const rect = await page.locator("[data-agent-ui-qa=" + view + "]").boundingBox();
      expect(rect.width).toBeLessThanOrEqual(width + 2);
    }
  }
});
test("modal retains keyboard focus, can be dismissed and still fits narrow viewport", async ({ page }) => {
  await mockAgentApi(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/agent-ui-qa.html?view=skills");
  const trigger = page.getByRole("button", { name: "Create skill", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Create a skill" });
  await expect(dialog).toBeVisible();
  const rect = await dialog.boundingBox();
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(322);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
test("CSS-based 200% zoom approximation does not hide the primary CTA", async ({ page }) => {
  await mockAgentApi(page);
  await page.setViewportSize({ width: 640, height: 780 });
  await page.goto("/agent-ui-qa.html?view=skills");
  await page.evaluate(() => { document.body.style.zoom = "2"; });
  await expect(page.getByRole("button", { name: "Create skill", exact: true })).toBeVisible();
  await expect.poll(() => overflow(page)).toBe(false);
});
test("25 repeat view loads do not throw errors, leave dialogs open or mutate records", async ({ page }) => {
  const state = await mockAgentApi(page);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  for (let index = 0; index < 25; index++) {
    await page.goto("/agent-ui-qa.html?view=" + views[index % views.length]);
    await expect(page.locator("[data-agent-ui-qa]")).toBeVisible();
  }
  expect(errors).toEqual([]);
  expect(state.calls.filter(call => call.method !== "GET")).toHaveLength(0);
});
