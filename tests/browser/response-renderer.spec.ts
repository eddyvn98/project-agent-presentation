import { expect, test } from "@playwright/test";

test("full answer supports tables, code, sources and multiple data charts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Response renderer QA" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chart renderer QA" })).toBeVisible();
  const table = page.getByRole("region", { name: "Scrollable response table" }).first();
  await expect(table.getByRole("columnheader", { name: "Revenue" })).toBeVisible();
  await expect(page.locator("pre").filter({ hasText: "console.log(values.reduce" })).toBeVisible();
  const line = page.locator("figure").filter({ hasText: "Synthetic line chart" }).first();
  await expect(line.getByRole("region", { name: "Scrollable chart: Synthetic line chart" })).toBeVisible();
  await line.getByRole("button", { name: "Table", exact: true }).click();
  const values = line.getByRole("table");
  await expect(values.getByRole("columnheader", { name: "Revenue" })).toBeVisible();
  await expect(values.getByRole("rowheader", { name: "August" })).toBeVisible();
  await expect(values.getByRole("cell", { name: "2,680" })).toBeVisible();
  await line.getByRole("button", { name: "Chart", exact: true }).click();
  await expect(line.getByRole("img", { name: "Synthetic line chart" })).toBeVisible();
  const pie = page.locator("figure").filter({ hasText: "Synthetic pie chart" }).first();
  await expect(pie.getByRole("img", { name: "Synthetic pie chart" })).toBeVisible();
});

for (const width of [390, 768]) {
  test("complete answer reflows at " + width + "px with horizontally scrollable charts", async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const chart = page.getByRole("region", { name: "Scrollable chart: Synthetic line chart" });
    await expect(chart).toBeVisible();
    const sizes = await chart.evaluate(element => ({
      inner: element.scrollWidth, visible: element.clientWidth,
      page: document.documentElement.scrollWidth, viewport: innerWidth,
    }));
    if (width === 390) expect(sizes.inner).toBeGreaterThan(sizes.visible);
    expect(sizes.page).toBeLessThanOrEqual(sizes.viewport + 2);
    const table = page.getByRole("region", { name: "Scrollable response table" }).first();
    await expect(table).toBeVisible();
    await expect(table.getByRole("rowheader", { name: "January" })).toBeVisible();
  });
}
