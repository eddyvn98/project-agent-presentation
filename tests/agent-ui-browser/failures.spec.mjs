import { test, expect } from "@playwright/test";
import { mockAgentApi } from "./fixtures.mjs";

test("failed skill write preserves form; second attempt creates exactly once", async ({ page }) => {
  const options = { failNextWrites: 1 };
  const state = await mockAgentApi(page, options);
  await page.goto("/agent-ui-qa.html?view=skills");
  await page.getByRole("button", { name: "Create skill", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create a skill" });
  await dialog.getByRole("textbox", { name: "Skill name" }).fill("Retry skill");
  await dialog.getByRole("textbox", { name: "Skill instructions" }).fill(
    "A safe synthetic instruction that does not execute user data.");
  await dialog.getByRole("button", { name: "Create skill" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Synthetic write failed" })).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(state.skills.filter(s => s.name === "Retry skill")).toHaveLength(0);
  await dialog.getByRole("button", { name: "Create skill" }).click();
  await expect(page.getByRole("heading", { name: "Retry skill" })).toBeVisible();
  expect(state.skills.filter(s => s.name === "Retry skill")).toHaveLength(1);
});
test("permission denial does not toggle skill and exposes actionable error", async ({ page }) => {
  const state = await mockAgentApi(page, { denyWrites: true });
  await page.goto("/agent-ui-qa.html?view=skills");
  await expect(page.getByRole("switch", { name: "Disable Evidence review" })).toBeVisible();
  await page.getByRole("switch", { name: "Disable Evidence review" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Forbidden" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Disable Evidence review" })).toHaveAttribute("aria-checked", "true");
  expect(state.skills[0].enabled).toBe(true);
});

test("slow create rejects overlapping submissions and recovers after reload", async ({ page }) => {
  const state = await mockAgentApi(page, { delayWritesMs: 250 });
  await page.goto("/agent-ui-qa.html?view=skills");
  await page.getByRole("button", { name: "Create skill", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create a skill" });
  await dialog.getByRole("textbox", { name: "Skill name" }).fill("Slow skill");
  await dialog.getByRole("textbox", { name: "Skill instructions" }).fill(
    "Review the result and do not submit twice while waiting for network.");
  await dialog.getByRole("button", { name: "Create skill" }).click();
  await expect(dialog.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Slow skill" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Slow skill" })).toBeVisible();
  expect(state.calls.filter(c => c.endpoint.endsWith("/personal-skills") && c.method === "POST")).toHaveLength(1);
});

test("denied website permission mutation keeps the existing read-only grant", async ({ page }) => {
  const state = await mockAgentApi(page, { denyWrites: true });
  await page.goto("/agent-ui-qa.html?view=sessions");
  await expect(page.getByText("docs.example.test")).toBeVisible();
  await page.getByRole("checkbox", { name: "Allow unattended tasks to reuse login" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Website permission change failed" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Allow unattended tasks to reuse login" })).not.toBeChecked();
  expect(state.sites[0].automation).toBe(false);
});

test("untrusted skill text is rendered as text, never evaluated as HTML", async ({ page }) => {
  const state = await mockAgentApi(page);
  const probe = '<img src=x onerror="window.__qa_injected=true">';
  state.skills[0].description = probe;
  state.skills[0].instructions = probe;
  await page.goto("/agent-ui-qa.html?view=skills");
  await expect(page.getByText(probe, { exact: true }).first()).toBeVisible();
  await page.getByText("View instructions").first().click();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => Boolean(window.__qa_injected))).toBe(false);
});
