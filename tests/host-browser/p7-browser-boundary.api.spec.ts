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

test("opt-in Browser Watch returns a real protected JPEG frame", async ({ request, baseURL }) => {
  test.skip(process.env.P7_ALLOW_BROWSER_WATCH !== "1" || !qaTask(),
    "Requires P7_ALLOW_BROWSER_WATCH=1 and an active synthetic QA browser session");
  test.setTimeout(90_000);
  const watch = taskBase() + "/" + encodeURIComponent(qaTask()) + "/browser";
  const origin = new URL(baseURL!).origin;
  const enabled = await request.post(watch, { headers: { Origin: origin },
    data: { watch: true }, failOnStatusCode: false });
  expect(enabled.ok()).toBe(true);
  try {
    let available = false;
    for (let i = 0; i < 12; i++) {
      const status = await request.get(watch, { failOnStatusCode: false });
      const body = await status.json() as { preview?: { hasImage?: boolean } };
      if (body.preview?.hasImage) { available = true; break; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    expect(available, "Agent did not create a new browser frame in the active QA session").toBe(true);
    const image = await request.get(watch + "?image=1", { failOnStatusCode: false });
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/jpeg");
    const bytes = await image.body();
    expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xd8]);
  } finally {
    await request.post(watch, { headers: { Origin: origin },
      data: { watch: false }, failOnStatusCode: false });
  }
});

test("optional safe takeover and handback on a dedicated test session", async ({ request, baseURL }) => {
  test.skip(!allowControl() || !qaTask(), "Requires P7_ALLOW_BROWSER_CONTROL=1 and a running QA browser task");
  const origin = new URL(baseURL!).origin;
  const watch = taskBase() + "/" + encodeURIComponent(qaTask()) + "/browser";
  const endpoint = watch + "/control";
  const enabled = await request.post(watch, { headers: { Origin: origin },
    data: { watch: true }, failOnStatusCode: false });
  expect(enabled.ok()).toBe(true);
  let acquired = false;
  try {
    const takeover = await request.post(endpoint, { headers: { Origin: origin },
      data: { op: "takeover" }, failOnStatusCode: false });
    expect(takeover.ok()).toBe(true);
    acquired = true;
    const status = await request.get(watch);
    expect((await status.json() as { control?: { paused?: boolean } }).control?.paused).toBe(true);
  } finally {
    if (acquired) {
      const release = await request.post(endpoint, { headers: { Origin: origin },
        data: { op: "release" }, failOnStatusCode: false });
      expect(release.ok()).toBe(true);
    }
    await request.post(watch, { headers: { Origin: origin },
      data: { watch: false }, failOnStatusCode: false });
  }
});
