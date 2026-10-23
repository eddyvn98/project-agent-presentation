import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("math, hierarchy, figure bounds and no page overflow", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Readable mathematics" })).toBeVisible();
  await expect(page.locator(".katex-display math")).toHaveCount(1);
  await expect(page.getByText("\\notARealCommand", { exact: true }).first()).toBeVisible();
  const inline = await page.locator('[data-size="inline"]').boundingBox();
  const reference = await page.locator('[data-size="reference"]').boundingBox();
  expect(inline!.width).toBeLessThan(reference!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator("p figure, a button").count()).toBe(0);
});

test("image enlargement, actual zoom and keyboard dismissal", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Enlarge A synthetic blue marker" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const image = dialog.getByRole("img", { name: "A synthetic blue marker", exact: true });
  const before = await image.boundingBox();
  await page.getByRole("button", { name: "Zoom in image" }).click();
  await expect(dialog.getByRole("status")).toHaveText("150%");
  expect((await image.boundingBox())!.width).toBeGreaterThan(before!.width * 1.4);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("eight-state explorer navigation and legible zoom", async ({ page }) => {
  await page.getByRole("combobox").selectOption("7");
  await expect(page.getByRole("heading", { name: "Position 8" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Choose a step" })).toHaveAttribute("aria-valuetext", "State 8");
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Enlarge Position 8 scene" }).click();
  const scene = page.getByRole("dialog").locator('svg[role="img"]');
  const before = await scene.boundingBox();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  expect((await scene.boundingBox())!.width).toBeGreaterThan(before!.width * 1.2);
  const text = scene.locator("text");
  expect(await text.evaluate((element) => parseFloat(getComputedStyle(element).fontSize) * element.getBoundingClientRect().width / (element as SVGGraphicsElement).getBBox().width)).toBeGreaterThanOrEqual(30);
  await page.keyboard.press("Escape");
  await page.getByRole("slider", { name: "Choose a step" }).focus();
  await page.keyboard.press("Home");
  await expect(page.getByRole("heading", { name: "Position 1" })).toBeVisible();
});

test("Mermaid loads and enlarged labels scale", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Enlarge Diagram", exact: true }).first();
  await expect(trigger).toBeVisible({ timeout: 30000 });
  await trigger.click();
  const diagram = page.getByRole("img", { name: "Diagram", exact: true });
  const before = await diagram.boundingBox();
  await page.getByRole("button", { name: "Zoom in diagram" }).click();
  expect((await diagram.boundingBox())!.width).toBeGreaterThan(before!.width * 1.2);
  await expect(page.getByRole("region", { name: "Diagram, scrollable enlarged diagram" })).toBeVisible();
});

test("citation stays within viewport and returns keyboard focus", async ({ page }) => {
  const trigger = page.getByRole("button", { name: /Show source:/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const popover = page.getByRole("dialog");
  await expect(popover).toBeVisible();
  const box = (await popover.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await expect(popover.getByRole("link")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("failed images and invalid visuals leave complete prose", async ({ page }) => {
  await page.route("**/demo/marker.svg", route => route.abort());
  await page.reload();
  await expect(page.getByText("Illustration unavailable: A synthetic blue marker")).toBeVisible();
  await expect(page.getByText("Visual unavailable. Continue with the accompanying explanation.")).toBeVisible();
  await expect(page.getByText("The explanation remains visible when optional visual data is malformed:")).toBeVisible();
});
