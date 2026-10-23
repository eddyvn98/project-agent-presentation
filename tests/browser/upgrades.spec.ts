import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Readable mathematics" })).toBeVisible();
  await expect(page.getByText("Finishing math layout…")).toHaveCount(0);
});

test("default response stays in reading mode with compact sources and copy", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Present as slides" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy response", exact: true })).toBeVisible();
  const sources = page.locator(".agent-sources");
  await expect(sources).not.toHaveAttribute("open", "");
  await sources.locator("summary").click();
  await expect(sources.getByRole("link", { name: /Synthetic reference/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("opt-in slide mode has navigable headings and restores full answer", async ({ page }) => {
  await page.goto("/?presentation=1");
  await expect(page.getByText("Finishing math layout…")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Interactive model" })).toBeVisible();
  await page.getByRole("button", { name: "Present as slides" }).click();
  await expect(page.getByRole("button", { name: "Next slide" })).toBeVisible();
  await page.getByRole("button", { name: "Next slide" }).click();
  await expect(page.getByRole("button", { name: "Read full answer" })).toBeVisible();
  await page.getByRole("button", { name: "Read full answer" }).click();
  await expect(page.getByRole("heading", { name: "Interactive model" })).toBeVisible();
});

test("bounded interactive calculator works on responsive viewport", async ({ page }) => {
  const slider = page.getByRole("slider", { name: "Starting amount" });
  await expect(slider).toHaveValue("1000");
  await slider.focus();
  await slider.press("Home");
  await slider.press("ArrowRight");
  await expect(page.getByText(/2\.315,25/)).toBeVisible();
  await page.getByRole("button", { name: "Show data" }).click();
  await expect(page.getByRole("table")).toBeVisible();
});

test("learning check offers accessible feedback", async ({ page }) => {
  await expect(page.getByText("What is 2 + 2?")).toBeVisible();
  await page.getByRole("button", { name: "2. 4" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
});

test("chart renderer is loaded only when the answer contains a valid chart", async ({ page }) => {
  const chartRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/src/components/ProjectAgentChart.tsx")) chartRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Interactive model" })).toBeVisible();
  expect(chartRequests).toHaveLength(0);

  await page.goto("/?chart=1");
  await expect(page.getByRole("img", { name: "Synthetic chart" })).toBeVisible();
  await expect(page.getByText("Finishing math layout…")).toHaveCount(0);
  expect(chartRequests.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
});

test("plain prose does not request the deferred math renderer", async ({ page }) => {
  const mathRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/src/components/ProjectAgentMathMarkdown.tsx")) {
      mathRequests.push(request.url());
    }
  });
  await page.goto("/?plain=1");
  await expect(page.getByText("A short synthetic answer with no formulas, diagrams or charts.")).toBeVisible();
  expect(mathRequests).toHaveLength(0);
  await page.goto("/");
  await expect(page.locator(".katex-display math")).toHaveCount(1);
  expect(mathRequests.length).toBeGreaterThan(0);
});
