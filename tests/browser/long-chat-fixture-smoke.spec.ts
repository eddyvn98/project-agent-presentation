import { test, expect } from "@playwright/test";

test("host long-chat fixture resolves and mounts the bounded real answer renderer", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", error => problems.push("JS: " + error.message));
  page.on("console", message => {
    if (message.type() === "error") problems.push("CONSOLE: " + message.text().slice(0, 350));
  });
  page.on("response", response => {
    if (response.status() >= 400 && response.url().includes("127.0.0.1"))
      problems.push("HTTP " + response.status() + ": " + response.url().slice(0, 180));
  });
  const response = await page.goto("/long-chat-qa.html");
  expect(response?.status()).toBe(200);
  try {
    await expect(page.getByTestId("qa-message")).toHaveCount(80, { timeout: 7000 });
  } catch {
    throw new Error("Long-chat host fixture did not mount. Diagnostics: " +
      JSON.stringify(problems.slice(0, 12)) + "; body=" +
      (await page.locator("body").innerText().catch(() => "")).slice(0, 500));
  }
  expect(problems).toEqual([]);
});
