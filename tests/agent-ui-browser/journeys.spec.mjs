import { test, expect } from "@playwright/test";
import { mockAgentApi } from "./fixtures.mjs";

const open = (page, view) => page.goto("/agent-ui-qa.html?view=" + view);
test("skill create, enable, reload, then install curated guidance disabled", async ({ page }) => {
  const state = await mockAgentApi(page);
  await open(page, "skills");
  await page.getByRole("button", { name: "Create skill", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create a skill" });
  await dialog.getByRole("textbox", { name: "Skill name" }).fill("Source audit QA");
  await dialog.getByRole("textbox", { name: "Skill instructions" }).fill(
    "Validate each claim against the original source and report discrepancies.");
  await dialog.getByRole("button", { name: "Create skill" }).click();
  await page.getByRole("switch", { name: "Enable Source audit QA" }).click();
  await expect(page.getByRole("switch", { name: "Disable Source audit QA" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Disable Source audit QA" })).toBeVisible();
  await page.getByRole("tab", { name: "Explore library" }).click();
  await page.getByRole("button", { name: "Add to my skills" }).click();
  await expect(page.getByRole("switch", { name: "Enable Source verification" })).toBeVisible();
  expect(state.skills.filter(s => s.name === "Source verification")).toHaveLength(1);
  expect(state.calls.filter(c => c.endpoint.endsWith("/skill-catalog") && c.method === "POST")).toHaveLength(1);
});

test("workflow run advances only on approval and user input; no implicit continuation", async ({ page }) => {
  const state = await mockAgentApi(page);
  await open(page, "workflows");
  await expect(page.getByText("Weekly report", { exact: true })).toBeVisible();
  const card = page.locator("article").filter({ hasText: "Weekly report" }).first();
  await card.getByRole("button", { name: "Run now" }).click();
  await expect(card.getByRole("button", { name: "Approve next step" })).toBeVisible();
  expect(state.runs[0].status).toBe("waiting_approval");
  await page.reload();
  await expect(page.getByRole("button", { name: "Approve next step" })).toBeVisible();
  await page.getByRole("button", { name: "Approve next step" }).click();
  await expect(page.getByRole("status", { name: "" }).filter({ hasText: "Input needed" })).toBeVisible();
  await page.getByRole("textbox", { name: "Workflow missing input" }).fill("132");
  await page.getByRole("button", { name: "Continue with input" }).click();
  await expect(page.getByText(/run-1 · done/)).toBeVisible();
  expect(state.runs).toHaveLength(1);
  expect(state.calls.filter(c => c.endpoint.endsWith("/workflows") && c.method === "PATCH"
    && c.body.action === "approve_step")).toHaveLength(1);
  expect(state.calls.filter(c => c.endpoint.endsWith("/workflows") && c.method === "PATCH"
    && c.body.action === "provide_input")).toHaveLength(1);
});

test("schedule pause, reload, resume, and create preserves exact recurrence", async ({ page }) => {
  const state = await mockAgentApi(page);
  await open(page, "schedules");
  await expect(page.getByText("Morning brief", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Create schedule" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill("Weekly QA check");
  await page.getByRole("textbox", { name: "Agent instructions" }).fill("Review reports and summarize changes.");
  await page.getByRole("combobox", { name: "Frequency" }).selectOption("weekly");
  await page.getByRole("button", { name: "Create schedule", exact: true }).last().click();
  await expect(page.getByText("Weekly QA check", { exact: true })).toBeVisible();
  expect(state.schedules.find(s => s.title === "Weekly QA check").spec.kind).toBe("weekly");
  expect(state.schedules[0].status).toBe("active");
});

test("approval stays pending until explicitly accepted, then disappears after reload", async ({ page }) => {
  const pending = { id: "apa-test", state: "pending", host: "example.test",
    projectId: "p-qa", taskId: "task-qa", intent: "Submit form once",
    createdAt: "2026-10-27T00:00:00Z", expiresAt: "2030-10-27T00:00:00Z" };
  const state = await mockAgentApi(page, { approvals: [pending] });
  await open(page, "settings");
  await expect(page.getByRole("button", { name: "Approve once" })).toBeVisible();
  expect(state.approvals[0].state).toBe("pending");
  await page.getByRole("button", { name: "Approve once" }).click();
  await expect(page.getByText("No actions waiting for your decision.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("No actions waiting for your decision.")).toBeVisible();
  expect(state.approvals[0].state).toBe("approved");
});
