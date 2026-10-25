import { test, expect } from "@playwright/test";
import { allowControl, taskBase } from "./qa-helpers";

const qaTask = () => process.env.P7_RUNNING_BROWSER_TASK_ID ?? "";

test("unknown browser task must not expose private preview", async ({ request }) => {
  const response = await request.get(taskBase() + "/pat_p7_nonexistent/browser", { failOnStatusCode: false });
  expect([403, 404].includes(response.status())).toBe(true);
});

test("browser control refuses missing Origin", async ({ request }) => {
  const response = await request.post(taskBase() + "/pat_p7_nonexistent/browser/control",
    { data: { op: "takeover" }, failOnStatusCode: false });
  expect(response.status()).toBe(403);
});

test("browser control rejects foreign Origin", async ({ request }) => {
  const response = await request.post(taskBase() + "/pat_p7_nonexistent/browser/control",
    { headers: { Origin: "https://attacker.invalid" }, data: { op: "takeover" }, failOnStatusCode: false });
  expect(response.status()).toBe(403);
});

test("active owner browser status is available without exposing image content", async ({ request }) => {
  test.skip(!qaTask(), "Provide P7_RUNNING_BROWSER_TASK_ID from an active isolated QA task");
  const response = await request.get(taskBase() + "/" + encodeURIComponent(qaTask()) + "/browser",
    { failOnStatusCode: false });
  expect(response.status()).toBe(200);
  const data = await response.json() as { preview?: { watching?: boolean }; control?: { paused?: boolean } };
  expect(data).toHaveProperty("preview");
  expect(data).toHaveProperty("control");
});

test("optional safe takeover and handback on a dedicated test session", async ({ request, baseURL }) => {
  test.skip(!allowControl() || !qaTask(), "Requires P7_ALLOW_BROWSER_CONTROL=1 and a running QA browser task");
  const endpoint = taskBase() + "/" + encodeURIComponent(qaTask()) + "/browser/control";
  const origin = new URL(baseURL!).origin;
  const takeover = await request.post(endpoint, { headers: { Origin: origin },
    data: { op: "takeover" }, failOnStatusCode: false });
  expect(takeover.ok()).toBe(true);
  try {
    const status = await request.get(taskBase() + "/" + encodeURIComponent(qaTask()) + "/browser");
    expect((await status.json() as { control?: { paused?: boolean } }).control?.paused).toBe(true);
  } finally {
    const release = await request.post(endpoint, { headers: { Origin: origin },
      data: { op: "release" }, failOnStatusCode: false });
    expect(release.ok()).toBe(true);
  }
});
