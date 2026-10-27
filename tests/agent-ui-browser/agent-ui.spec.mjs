import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockAgentApi } from "./fixtures.mjs";

const views = {
  skills: "Skills", workflows: "Workflows", schedules: "Scheduled tasks",
  settings: "Agent settings", sessions: "Website sessions",
};
const open = async (page, view, dark = false) => {
  await page.goto("/agent-ui-qa.html?view=" + view + (dark ? "&dark=1" : ""));
  await expect(page.locator("[data-agent-ui-qa=" + view + "]")).toBeVisible();
  await expect(page.getByRole("heading", { name: views[view], exact: true }).first()).toBeVisible();
};
const noOverflow = page => page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 2);

test.beforeEach(async ({ page }) => {
  await mockAgentApi(page);
});

for (const view of Object.keys(views)) {
  test(view + " renders on real Chromium with no horizontal overflow", async ({ page }, testInfo) => {
    await open(page, view);
    await expect.poll(() => noOverflow(page)).toBe(true);
    await expect(page.getByRole("navigation", { name: "Agent account settings" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(view + "-" + testInfo.project.name + "-light.png"),
      fullPage: true, animations: "disabled" });
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const high = axe.violations.filter(item => ["serious", "critical"].includes(item.impact));
    expect(high.map(item => ({ id: item.id, impact: item.impact,
      targets: item.nodes.map(node => node.target).slice(0, 4) }))).toEqual([]);
  });
  test(view + " supports dark mode without layout overflow", async ({ page }, testInfo) => {
    await open(page, view, true);
    await expect.poll(() => noOverflow(page)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(view + "-" + testInfo.project.name + "-dark.png"),
      fullPage: true, animations: "disabled" });
  });
}

test("Skills: keyboard modal, create, toggle and explore catalog", async ({ page }) => {
  await open(page, "skills");
  await expect(page.getByRole("heading", { name: "Evidence review" })).toBeVisible();
  const create = page.getByRole("button", { name: "Create skill", exact: true });
  await create.click();
  const dialog = page.getByRole("dialog", { name: "Create a skill" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(create).toBeFocused();
  await create.click();
  await dialog.getByRole("textbox", { name: "Skill name" }).fill("QA test skill");
  await dialog.getByRole("textbox", { name: "Skill instructions" })
    .fill("Read real evidence and verify the user request before completion.");
  await dialog.getByRole("button", { name: "Create skill" }).click();
  await expect(page.getByRole("heading", { name: "QA test skill" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Enable QA test skill" })).toBeVisible();
  await page.getByRole("switch", { name: "Enable QA test skill" }).click();
  await expect(page.getByRole("switch", { name: "Disable QA test skill" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("tab", { name: "Explore library" }).click();
  await expect(page.getByRole("heading", { name: "Source verification" })).toBeVisible();
});

test("Workflows: list first, then create an editable process", async ({ page }) => {
  await open(page, "workflows");
  await expect(page.getByText("Weekly report", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "New workflow" })).toHaveCount(0);
  await page.getByRole("button", { name: /Create workflow/ }).first().click();
  await page.getByRole("heading", { name: "New workflow" }).waitFor();
  const form = page.locator("form");
  await form.getByRole("textbox", { name: "Name" }).fill("Synthetic QA flow");
  await form.getByPlaceholder("Step title").fill("Review inputs");
  await form.getByPlaceholder("What should the Agent do?").fill("Verify the fixture");
  await form.getByRole("button", { name: "Create workflow" }).click();
  await expect(page.getByText("Synthetic QA flow", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "New workflow" })).toHaveCount(0);
});

test("Schedules: editing form opens only on demand and can create schedule", async ({ page }) => {
  await open(page, "schedules");
  await expect(page.getByText("Morning brief", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "New scheduled task" })).toHaveCount(0);
  await page.getByRole("button", { name: "Create schedule" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill("QA daily summary");
  await page.getByRole("textbox", { name: "Agent instructions" }).fill("Provide a short status report.");
  await page.getByRole("button", { name: "Create schedule", exact: true }).last().click();
  await expect(page.getByText("QA daily summary", { exact: true })).toBeVisible();
});

test("Browser sessions: permissions change without duplicating grants", async ({ page }) => {
  await open(page, "sessions");
  await expect(page.getByText("docs.example.test")).toBeVisible();
  const automation = page.getByRole("checkbox", { name: "Allow unattended tasks to reuse login" });
  await automation.click();
  await expect(automation).toBeChecked();
  await expect(page.getByText("docs.example.test")).toHaveCount(1);
});

test("Settings: API failure is presented as an error, not a false success", async ({ page }) => {
  await page.route("**/api/project-agent/browser-policies", route =>
    route.fulfill({ status: 503, contentType: "application/json",
      body: JSON.stringify({ error: "Synthetic service failure" }) }));
  await open(page, "settings");
  await expect(page.getByRole("alert").filter({ hasText: "Browser policies unavailable" })).toBeVisible();
});
