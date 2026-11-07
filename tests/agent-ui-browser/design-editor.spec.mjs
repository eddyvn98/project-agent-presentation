import { test, expect } from "@playwright/test";

const concept = {
  title: "Concept QA", units: "mm",
  room: { width: 6000, depth: 4500, height: 3000, wallThickness: 150 },
  openings: [{ wall: "south", kind: "door", offset: 300, width: 900, height: 2100, sill: 0 }],
  furniture: [{ kind: "table", x: 3000, y: 2200, width: 1500, depth: 800, height: 750,
    rotation: 0, label: "Meeting table" }],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/projects/qa/agent/tasks/qa/files/design.json", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(concept) }));
  await page.goto("/design-handoff-qa.html");
});

test("mobile-first editor prepares typed furniture edits without posting or altering original", async ({ page, isMobile }) => {
  const posts = [];
  page.on("request", request => { if (request.method() === "POST") posts.push(request.url()); });
  await page.getByRole("button", { name: "Edit on floor plan" }).click();
  const editor = page.getByRole("region", { name: "Editable 2D interior floor plan" });
  await expect(editor).toBeVisible();
  if (isMobile) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await expect(editor.getByText("Position: 3,000, 2,200 mm")).toBeVisible();
  await editor.getByRole("button", { name: "Move right" }).click();
  await editor.getByRole("button", { name: "width plus 100 mm" }).click();
  await expect(editor.getByText("Position: 3,100, 2,200 mm")).toBeVisible();
  await expect(editor.getByText("Width: 1,600 mm")).toBeVisible();
  await expect(editor.getByRole("button", { name: "Prepare new revision in chat" })).toBeDisabled();
  await editor.getByRole("checkbox", { name: "I reviewed the design draft" }).check();
  await editor.getByRole("button", { name: "Prepare new revision in chat" }).click();
  const draft = page.getByRole("textbox", { name: "Design change draft" });
  await expect(draft).toContainText('"type":"move_furniture"');
  await expect(draft).toContainText('"type":"resize_furniture"');
  await expect(draft).toContainText("outputs/design-abcdefabcdef.design.json");
  expect(posts).toHaveLength(0);
});

test("reset removes pending changes and never submits", async ({ page }) => {
  await page.getByRole("button", { name: "Edit on floor plan" }).click();
  const editor = page.getByRole("region", { name: "Editable 2D interior floor plan" });
  await expect(editor.getByRole("button", { name: "Move up" })).toBeVisible();
  const save = editor.getByRole("button", { name: "Prepare new revision in chat" });
  await expect(save).toBeDisabled();
  await editor.getByRole("button", { name: "Move up" }).click();
  await expect(save).toBeDisabled();
  await editor.getByRole("checkbox", { name: "I reviewed the design draft" }).check();
  await expect(save).toBeEnabled();
  await editor.getByRole("button", { name: "Reset draft" }).click();
  await expect(save).toBeDisabled();
  await expect(editor.getByText("Position: 3,000, 2,200 mm")).toBeVisible();
});

test("rejects oversized edits and preserves the last valid model", async ({ page }) => {
  await page.getByRole("button", { name: "Edit on floor plan" }).click();
  const editor = page.getByRole("region", { name: "Editable 2D interior floor plan" });
  for (let i = 0; i < 7; i++) await editor.getByRole("button", { name: "width plus 100 mm" }).click();
  await expect(editor.getByText("Width: 2,200 mm")).toBeVisible();
  for (let i = 0; i < 40; i++) await editor.getByRole("button", { name: "width plus 100 mm" }).click();
  await expect(editor.getByRole("alert")).toBeVisible();
  await expect(editor.getByText("Width: 5,700 mm")).toBeVisible();
});


test("AI flags a real collision and requires human correction rather than accepting the revision", async ({ page }) => {
  const blocked = { ...concept, furniture: [
    concept.furniture[0],
    { ...concept.furniture[0], kind: "sofa", label: "Overlapping sofa",
      x: 3000, y: 2200, width: 900, depth: 700, height: 600 },
  ] };
  await page.route("**/api/projects/qa/agent/tasks/qa/files/design.json", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(blocked) }));
  await page.goto("/design-handoff-qa.html");
  await page.getByRole("button", { name: "Edit on floor plan" }).click();
  const editor = page.getByRole("region", { name: "Editable 2D interior floor plan" });
  const review = editor.getByRole("region", { name: "AI geometry preflight" });
  await expect(review).toContainText("1 blockers");
  await expect(review).toContainText("Possible 2D collision");
  await editor.getByRole("button", { name: "Move right" }).click();
  await editor.getByRole("checkbox", { name: "I reviewed the design draft" }).check();
  await expect(editor.getByRole("button", { name: "Prepare new revision in chat" })).toBeDisabled();
  await editor.getByRole("button", { name: "Ask AI to propose a repair from saved design" }).click();
  await expect(page.getByRole("textbox", { name: "Design change draft" })).toContainText("AI preflight flagged");
  await expect(editor).toHaveCount(0);
});

test("human review acknowledgement is invalidated by a subsequent geometry change", async ({ page }) => {
  await page.getByRole("button", { name: "Edit on floor plan" }).click();
  const editor = page.getByRole("region", { name: "Editable 2D interior floor plan" });
  await editor.getByRole("button", { name: "Move right" }).click();
  const approved = editor.getByRole("checkbox", { name: "I reviewed the design draft" });
  await approved.check();
  await expect(editor.getByRole("button", { name: "Prepare new revision in chat" })).toBeEnabled();
  await editor.getByRole("button", { name: "Move up" }).click();
  await expect(approved).not.toBeChecked();
  await expect(editor.getByRole("button", { name: "Prepare new revision in chat" })).toBeDisabled();
});
