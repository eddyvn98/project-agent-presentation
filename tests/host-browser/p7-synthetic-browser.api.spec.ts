import { test, expect } from "@playwright/test";
import { taskBase, projectId } from "./qa-helpers";
const enabled = () => process.env.P7_ALLOW_BROWSER_CONTROL === "1" &&
  Boolean(process.env.P7_RUNNING_BROWSER_TASK_ID) && Boolean(process.env.P7_FIXTURE_BUTTON_X);
const fixture = () => `/api/projects/${encodeURIComponent(projectId())}/agent/p7-qa`;
const taskId = () => process.env.P7_RUNNING_BROWSER_TASK_ID!;
const watch = () => `${taskBase()}/${encodeURIComponent(taskId())}/browser`;

test("in-memory Chromium produces a real private JPEG Watch frame", async ({ request }) => {
  test.skip(!enabled(), "Bootstrap synthetic browser fixture and opt in to Watch");
  const response = await request.get(watch(), { failOnStatusCode: false });
  expect(response.status()).toBe(200);
  expect((await response.json() as { preview: { hasImage: boolean } }).preview.hasImage).toBe(true);
  const image = await request.get(watch() + "?image=1", { failOnStatusCode: false });
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/jpeg");
  expect([...(await image.body()).subarray(0, 2)]).toEqual([255, 216]);
});
test("owner performs synthetic manual click and returns control", async ({ request, baseURL }) => {
  test.skip(!enabled(), "Requires local synthetic browser and browser-control opt-in");
  const headers = { Origin: new URL(baseURL!).origin };
  const endpoint = watch() + "/control";
  let acquired = false;
  try {
    const taken = await request.post(endpoint, { headers, data: { op: "takeover" }, failOnStatusCode: false });
    expect(taken.status()).toBe(200); acquired = true;
    const body = await (await request.get(watch())).json() as
      { preview: { sequence: number }; control: { paused: boolean } };
    expect(body.control.paused).toBe(true);
    const clicked = await request.post(endpoint, { headers, data: { op: "click",
      frame: body.preview.sequence, x: Number(process.env.P7_FIXTURE_BUTTON_X),
      y: Number(process.env.P7_FIXTURE_BUTTON_Y) }, failOnStatusCode: false });
    expect(clicked.status(), await clicked.text()).toBe(200);
    const details = await (await request.get(fixture() + "?taskId=" + taskId(), { headers })).json() as
      { count: string };
    expect(Number(details.count)).toBeGreaterThan(0);
  } finally {
    if (acquired) {
      const release = await request.post(endpoint, { headers, data: { op: "release" }, failOnStatusCode: false });
      expect(release.ok()).toBe(true);
    }
  }
  const final = await (await request.get(watch())).json() as { control: { paused: boolean } };
  expect(final.control.paused).toBe(false);
});
test("nonmember cannot access synthetic browser fixture", async ({ playwright, baseURL }) => {
  test.skip(!enabled() || !process.env.P7_OTHER_STORAGE_STATE, "Needs distinct nonmember QA credentials");
  const ctx = await playwright.request.newContext({ baseURL, storageState: process.env.P7_OTHER_STORAGE_STATE,
    extraHTTPHeaders: { Origin: new URL(baseURL!).origin } });
  try {
    const response = await ctx.get(fixture() + "?taskId=" + taskId(), { failOnStatusCode: false });
    expect([401, 403, 404].includes(response.status())).toBe(true);
  } finally { await ctx.dispose(); }
});
test("crashed isolated Chromium can be replaced and yields a fresh frame", async ({ request, baseURL }) => {
  test.skip(!enabled() || process.env.P7_ALLOW_BROWSER_CRASH !== "1",
    "Requires isolated QA process and explicit browser-crash opt-in");
  const headers = { Origin: new URL(baseURL!).origin };
  const prior = await (await request.get(watch())).json() as { preview: { sequence: number } };
  const crashed = await request.patch(fixture(), { headers, data: { kind: "crash", taskId: taskId() },
    failOnStatusCode: false });
  expect(crashed.status()).toBe(200);
  const recovered = await request.patch(fixture(), { headers,
    data: { kind: "recover", taskId: taskId() }, failOnStatusCode: false });
  expect(recovered.status(), await recovered.text()).toBe(200);
  const next = await (await request.get(watch())).json() as { preview: { sequence: number } };
  expect(next.preview.sequence).toBeGreaterThan(prior.preview.sequence);
});
