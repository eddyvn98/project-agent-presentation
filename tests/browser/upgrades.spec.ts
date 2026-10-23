import { test, expect } from "@playwright/test";

test("opt-in slide mode has navigable headings and restores full answer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Interactive model" })).toBeVisible();
  await page.getByRole("button", { name: "Present as slides" }).click();
  await expect(page.getByRole("button", { name: "Next slide" })).toBeVisible();
  await page.getByRole("button", { name: "Next slide" }).click();
  await expect(page.getByRole("button", { name: "Read full answer" })).toBeVisible();
  await page.getByRole("button", { name: "Read full answer" }).click();
  await expect(page.getByRole("heading", { name: "Interactive model" })).toBeVisible();
});

test("bounded interactive calculator works on responsive viewport", async ({ page }) => {
  await page.goto("/");
  const slider = page.getByRole("slider", { name: "Starting amount" });
  await expect(slider).toHaveValue("1000");
  await slider.focus();
  await slider.press("Home");
  await slider.press("ArrowRight");
  await expect(page.getByText(/2\.315,25/)).toBeVisible();
  await page.getByRole("button", { name: "Show data" }).click();
  await expect(page.getByRole("table")).toBeVisible();
});
