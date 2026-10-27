import { expect, test } from "@playwright/test";
for (const width of [390, 1280]) {
  test("L5 5,000-turn long chat mounts bounded answer DOM at " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 840 });
    const errors: string[] = [];
    page.on("pageerror", err => errors.push(err.message));
    await page.goto("/long-chat-qa.html");
    await expect(page.getByTestId("qa-stats")).toHaveText("Loaded 5000; mounted 80");
    await expect(page.getByTestId("qa-message")).toHaveCount(80);
    await expect(page.locator('[data-id="turn-4999"]')).toBeVisible();
    await expect(page.locator('[data-id="turn-0"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width + 2);
    const scroll = page.getByTestId("qa-scroll");
    await scroll.evaluate(node => { node.scrollTop = 0; });
    await page.getByRole("button", { name: "Show earlier loaded messages" }).click();
    await expect(page.getByTestId("qa-stats")).toHaveText("Loaded 5000; mounted 160");
    await expect(page.getByTestId("qa-message")).toHaveCount(160);
    await expect(page.locator('[data-id="turn-4840"]')).toHaveCount(1);
    await page.reload();
    await expect(page.getByTestId("qa-message")).toHaveCount(80);
    expect(errors).toEqual([]);
  });
}
