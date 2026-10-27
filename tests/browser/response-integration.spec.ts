import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => { await page.goto("/"); });

const figure = (page: import("@playwright/test").Page, title: string) =>
  page.locator("figure").filter({ hasText: title }).first();

test("mixed answer renders all four chart types with distinct data colors", async ({ page }) => {
  for (const kind of ["line", "pie", "bar", "stacked"]) {
    const item = figure(page, "Synthetic " + kind + " chart");
    await expect(item.getByRole("img", { name: "Synthetic " + kind + " chart" })).toBeVisible();
  }
  const lineColors = await figure(page, "Synthetic line chart")
    .locator(".recharts-line-curve").evaluateAll(paths =>
      paths.map(path => path.getAttribute("stroke")).filter(Boolean));
  expect(lineColors).toHaveLength(2);
  expect(new Set(lineColors).size).toBe(2);
  const pieColors = await figure(page, "Synthetic pie chart")
    .locator(".recharts-pie-sector path").evaluateAll(paths =>
      paths.map(path => path.getAttribute("fill")).filter(Boolean));
  expect(new Set(pieColors).size).toBe(3);
  const stacked = figure(page, "Synthetic stacked chart");
  await stacked.getByRole("button", { name: "Table", exact: true }).click();
  const table = stacked.getByRole("table");
  await expect(table.getByRole("rowheader", { name: "Q3" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Core" })).toBeVisible();
  await expect(table.getByRole("cell", { name: "70", exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: "30", exact: true })).toBeVisible();
});

test("diagram, formulas, tables, code and Vietnamese/English text coexist", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Đa ngôn ngữ / Multilingual QA" })).toBeVisible();
  await expect(page.getByText(/Tiếng Việt: đây là dữ liệu/)).toBeVisible();
  await expect(page.getByText("Người dùng", { exact: true })).toBeVisible();
  await expect(page.getByText("Active accounts", { exact: true })).toBeVisible();
  await expect(page.locator(".katex-display math")).toHaveCount(1);
  await expect(page.getByRole("columnheader", { name: "Margin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy code" })).toBeVisible();
  const diagram = figure(page, "Synthetic process diagram");
  await expect(diagram.locator("g.node")).toHaveCount(4, { timeout: 30000 });
  const styles = await diagram.locator("g.node").evaluateAll(nodes => nodes.map(node => {
    const shape = node.querySelector("rect,polygon,path,circle,ellipse");
    return shape ? { fill: getComputedStyle(shape).fill, stroke: getComputedStyle(shape).stroke } : null;
  }));
  expect(styles.every(style => style && style.fill !== "rgb(255, 255, 255)" && style.stroke !== "none")).toBe(true);
  expect(new Set(styles.map(style => style?.fill)).size).toBeGreaterThanOrEqual(3);
  await expect(page.getByRole("progressbar", { name: "Synthetic completion" })).toHaveAttribute("aria-valuenow", "72");
  await expect(page.getByText("Render safely", { exact: true })).toBeVisible();
});

for (const width of [320, 390, 768, 1280]) {
  test("integrated rich answer stays within page at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.reload();
    await expect(figure(page, "Synthetic stacked chart")).toBeVisible();
    await expect(figure(page, "Synthetic process diagram").locator("g.node")).toHaveCount(4, { timeout: 30000 });
    const result = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
    }));
    expect(result.documentWidth).toBeLessThanOrEqual(result.viewportWidth + 2);
    const chart = page.getByRole("region", { name: "Scrollable chart: Synthetic line chart" });
    const widths = await chart.evaluate(el => ({ content: el.scrollWidth, visible: el.clientWidth }));
    if (width <= 390) expect(widths.content).toBeGreaterThan(widths.visible);
  });
}
