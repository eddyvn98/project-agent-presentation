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
  await expect(page.getByRole("slider")).toHaveAttribute("aria-valuetext", "State 8");
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Enlarge Position 8 scene" }).click();
  const scene = page.getByRole("dialog").locator('svg[role="img"]');
  const before = await scene.boundingBox();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  expect((await scene.boundingBox())!.width).toBeGreaterThan(before!.width * 1.2);
  const text = scene.locator("text");
  expect(await text.evaluate((element) => parseFloat(getComputedStyle(element).fontSize) * element.getBoundingClientRect().width / (element as SVGGraphicsElement).getBBox().width)).toBeGreaterThanOrEqual(30);
  await page.keyboard.press("Escape");
  await page.getByRole("slider").focus();
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


test("long text diagram keeps its columns and scrolls on mobile instead of wrapping", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const diagram = page.locator("pre").filter({ hasText: "ASCII diagram QA" });
  await expect(diagram).toBeVisible();
  const layout = await diagram.evaluate(element => {
    const css = getComputedStyle(element);
    return { whitespace: css.whiteSpace, font: css.fontFamily,
      ligatures: css.fontVariantLigatures, overflow: css.overflowX,
      full: element.scrollWidth, visible: element.clientWidth,
      lines: element.textContent?.split("\n").length ?? 0 };
  });
  expect(layout.whitespace).toBe("pre");
  expect(layout.ligatures).toBe("none");
  expect(layout.overflow).toBe("auto");
  expect(layout.font.toLowerCase()).toMatch(/mono/);
  expect(layout.lines).toBe(4);
  expect(layout.full).toBeGreaterThan(layout.visible);
});

test("default Mermaid nodes have varied pastel fills and distinct borders", async ({ page }) => {
  const figure = page.locator("figure").filter({ has: page.getByRole("button", { name: "Enlarge Diagram", exact: true }) });
  const nodes = figure.locator("g.node");
  await expect(nodes).toHaveCount(4, { timeout: 30000 });
  const colors = await nodes.evaluateAll(nodes => nodes.map(node => {
    const shape = node.querySelector("rect, polygon, path, circle, ellipse");
    if (!shape) return null;
    const style = getComputedStyle(shape);
    return { fill: style.fill, stroke: style.stroke, text: node.textContent?.trim() };
  }));
  expect(colors.every(x => x && x.fill !== "rgb(255, 255, 255)" && x.stroke !== "none")).toBe(true);
  expect(new Set(colors.map(x => x?.fill)).size).toBeGreaterThanOrEqual(3);
  expect(colors.some(x => x?.fill === "rgb(254, 243, 199)")).toBe(true);
  await page.getByRole("button", { name: "Enlarge Diagram", exact: true }).click();
  const enlarged = page.getByRole("img", { name: "Diagram", exact: true });
  await expect(enlarged.locator('g.node[data-agent-color]')).toHaveCount(4);
});
