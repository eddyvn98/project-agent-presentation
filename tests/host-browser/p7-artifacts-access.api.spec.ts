import { existsSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { taskBase } from "./qa-helpers";

const id = () => process.env.P7_EXISTING_FILE_TASK_ID ?? "";
const fileId = () => process.env.P7_EXISTING_FILE_ID ?? "";

test("an authorized final artifact can be read without altering it", async ({ request }) => {
  test.skip(!id() || !fileId(), "Set P7_EXISTING_FILE_TASK_ID and P7_EXISTING_FILE_ID to a safe QA artifact");
  const url = `${taskBase()}/${encodeURIComponent(id())}/files/${encodeURIComponent(fileId())}`;
  const response = await request.get(url, { failOnStatusCode: false });
  expect(response.status()).toBe(200);
  const bytes = await response.body();
  expect(bytes.byteLength).toBeGreaterThan(0);
  expect(bytes.byteLength).toBeLessThan(100 * 1024 * 1024);
  expect(response.headers()["content-type"]).toBeTruthy();
});

test("file range responses remain bounded and consistent for PDFs", async ({ request }) => {
  test.skip(!id() || !fileId() || process.env.P7_FILE_IS_PDF !== "1",
    "Provide a PDF QA file and opt in using P7_FILE_IS_PDF=1");
  const url = `${taskBase()}/${encodeURIComponent(id())}/files/${encodeURIComponent(fileId())}`;
  const response = await request.get(url, { headers: { Range: "bytes=0-99" }, failOnStatusCode: false });
  expect(response.status()).toBe(206);
  expect(response.headers()["content-range"]).toMatch(/^bytes 0-99\/\d+$/);
  expect((await response.body()).byteLength).toBe(100);
});

test("another account cannot fetch the initiating owner's task artifacts", async ({ playwright, baseURL }) => {
  const other = process.env.P7_OTHER_STORAGE_STATE ?? "";
  test.skip(!other || !existsSync(other) || !id() || !fileId(),
    "Requires separate lower-privilege QA account and QA artifact; never use real employee accounts");
  const context = await playwright.request.newContext({ baseURL, storageState: other });
  try {
    const url = `${taskBase()}/${encodeURIComponent(id())}/files/${encodeURIComponent(fileId())}`;
    const response = await context.get(url, { failOnStatusCode: false, maxRedirects: 0 });
    // File sharing policy may grant collaborators access; use P7_OTHER_STORAGE_STATE as a nonmember only.
    expect([401, 403, 404].includes(response.status())).toBe(true);
  } finally { await context.dispose(); }
});

test("another account cannot watch the owner's browser frames", async ({ playwright, baseURL }) => {
  const other = process.env.P7_OTHER_STORAGE_STATE ?? "";
  const taskId = process.env.P7_RUNNING_BROWSER_TASK_ID;
  test.skip(!other || !existsSync(other) || !taskId,
    "Requires isolated second account and active QA browser task");
  const context = await playwright.request.newContext({ baseURL, storageState: other });
  try {
    const response = await context.get(`${taskBase()}/${encodeURIComponent(taskId!)}/browser`,
      { failOnStatusCode: false, maxRedirects: 0 });
    expect([401, 403, 404].includes(response.status())).toBe(true);
  } finally { await context.dispose(); }
});
