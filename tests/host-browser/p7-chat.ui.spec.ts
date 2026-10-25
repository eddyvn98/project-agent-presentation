import { test, expect } from "@playwright/test";

const chatPath = () => {
  const path = process.env.P7_PROJECT_CHAT_PATH ?? "";
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://"))
    throw new Error("P7_PROJECT_CHAT_PATH must be a local host route starting with /");
  return path;
};
test("authenticated Project Agent chat renders and composer is keyboard accessible", async ({ page }) => {
  test.skip(!process.env.P7_PROJECT_CHAT_PATH, "Set P7_PROJECT_CHAT_PATH to a signed-in Project Agent chat route");
  await page.goto(chatPath(), { waitUntil: "domcontentloaded" });
  const conversation = page.getByRole("region", { name: "Project Agent conversation" });
  await expect(conversation).toBeVisible();
  const textbox = conversation.getByRole("textbox").first();
  await expect(textbox).toBeVisible();
  await textbox.focus();
  await expect(textbox).toBeFocused();
  const send = page.getByRole("button", { name: /Send to Project Agent/i });
  await expect(send).toBeVisible();
  await expect(send).toBeDisabled();
});
test("Project Agent controls do not overflow desktop or 390px mobile", async ({ page }) => {
  test.skip(!process.env.P7_PROJECT_CHAT_PATH, "Set P7_PROJECT_CHAT_PATH to a signed-in Project Agent chat route");
  await page.goto(chatPath(), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "Project Agent conversation" })).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
});
test("Browser Preview opens on an existing QA browser task without auto-takeover", async ({ page }) => {
  test.skip(!process.env.P7_PROJECT_CHAT_PATH || !process.env.P7_RUNNING_BROWSER_TASK_ID,
    "Requires active QA browser task and Project chat route");
  await page.goto(chatPath());
  const open = page.getByRole("button", { name: /Open Browser Preview|Mở Browser Preview/ }).first();
  await expect(open).toBeVisible({ timeout: 15_000 });
  await open.click();
  await expect(page.getByRole("complementary", { name: /Open Browser Preview|Mở Browser Preview/ })).toBeVisible();
  await page.getByRole("button", { name: "Close Browser Preview" }).click();
  await expect(page.getByRole("complementary", { name: /Open Browser Preview|Mở Browser Preview/ })).toHaveCount(0);
});
