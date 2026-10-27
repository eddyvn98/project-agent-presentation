import { test, expect } from "@playwright/test";
import { mockAgentApi } from "./fixtures.mjs";
const views = ["skills", "workflows", "schedules", "settings", "sessions"];
const label = {
  skills: "Skills", workflows: "Workflows", schedules: "Scheduled tasks",
  settings: "Agent settings", sessions: "Website sessions",
};
test.beforeEach(async ({ page }) => { await mockAgentApi(page); });
for (const view of views) {
  test(view + " renders without overflow in a non-Chromium browser", async ({ page }) => {
    await page.goto("/agent-ui-qa.html?view=" + view);
    await expect(page.getByRole("heading", { name: label[view], exact: true }).first()).toBeVisible();
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  });
}
test("keyboard can open and dismiss the create-skill dialog", async ({ page }) => {
  await page.goto("/agent-ui-qa.html?view=skills");
  const create = page.getByRole("button", { name: "Create skill", exact: true });
  await create.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Create a skill" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(create).toBeFocused();
});
test("workflow creation and saved project selection work across browser engines", async ({ page }) => {
  await page.goto("/agent-ui-qa.html?view=workflows");
  await page.getByRole("button", { name: /Create workflow/ }).first().click();
  const form = page.locator("form");
  await form.getByRole("textbox", { name: "Name" }).fill("Cross browser flow");
  await form.getByPlaceholder("Step title").fill("Collect data");
  await form.getByPlaceholder("What should the Agent do?").fill("Read synthetic fixture");
  await form.getByRole("button", { name: "Create workflow" }).click();
  await expect(page.getByText("Cross browser flow", { exact: true })).toBeVisible();
});
test("dark-mode navigation remains accessible and no horizontal scroll appears", async ({ page }) => {
  await page.goto("/agent-ui-qa.html?view=sessions&dark=1");
  await expect(page.getByRole("navigation", { name: "Agent account settings" })).toBeVisible();
  await expect(page.getByText("docs.example.test")).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});
