import { test, expect } from "@playwright/test";
import { projectId, taskBase } from "./qa-helpers";

const synthetic = () => process.env.P7_SYNTHETIC_BROWSER_TASK === "1";
const fixture = () => `/api/projects/${encodeURIComponent(projectId())}/agent/p7-qa`;
const headers = (baseURL: string) => ({ Origin: new URL(baseURL).origin });

test("owner verifies authoritative Mongo task collection/key before relying on CAS", async ({ request, baseURL }) => {
  test.skip(!synthetic() || !process.env.P7_RUNNING_BROWSER_TASK_ID,
    "Requires existing synthetic browser fixture and dedicated QA login");
  const id = process.env.P7_RUNNING_BROWSER_TASK_ID!;
  const url = fixture() + "?taskId=" + encodeURIComponent(id) + "&verifyCas=1";
  const response = await request.get(url, { headers: headers(baseURL!), failOnStatusCode: false });
  expect(response.status(), "QA task-store mapping mismatch: inspect host repository schema").toBe(200);
  const body = await response.json() as { taskId: string; casMappingVerified: boolean };
  expect(body.taskId).toBe(id);
  expect(body.casMappingVerified).toBe(true);
});

test("explicit Stop purges synthetic JPEG and Chromium before rejecting recovery", async ({ request, baseURL }) => {
  test.skip(!synthetic() || process.env.P7_ALLOW_QA_STOP !== "1",
    "Requires P7_ALLOW_QA_STOP=1 on a synthetic-only isolated QA host");
  const origin = headers(baseURL!);
  const created = await request.post(fixture(), {
    headers: origin, data: { kind: "browser" }, failOnStatusCode: false,
  });
  expect(created.status(), await created.text()).toBe(201);
  const taskId = (await created.json() as { taskId: string; hasFrame: boolean }).taskId;
  const watch = taskBase() + "/" + encodeURIComponent(taskId) + "/browser";
  try {
    const first = await (await request.get(watch())).json() as
      { preview: { hasImage: boolean } | null };
    expect(first.preview?.hasImage).toBe(true);
    const stop = await request.post(taskBase() + "/" + taskId + "/stop", {
      headers: origin, failOnStatusCode: false,
    });
    expect(stop.status()).toBe(200);
    const state = await request.get(taskBase() + "/" + taskId);
    expect((await state.json() as { task: { status: string; cancelled?: boolean } }).task)
      .toMatchObject({ status: "failed", cancelled: true });
    const after = await (await request.get(watch())).json() as
      { preview: unknown; control: { paused: boolean } };
    expect(after.preview).toBeNull();
    expect(after.control.paused).toBe(false);
    expect((await request.get(watch + "?image=1")).status()).toBe(404);
    const browser = await request.get(fixture() + "?taskId=" + taskId, { headers: origin });
    expect((await browser.json() as { connected: boolean }).connected).toBe(false);
    const recover = await request.patch(fixture(), { headers: origin,
      data: { kind: "recover", taskId }, failOnStatusCode: false });
    expect(recover.status()).toBe(409);
  } finally {
    const deleted = await request.delete(fixture(), {
      headers: origin, data: { taskId }, failOnStatusCode: false,
    });
    expect(deleted.ok()).toBe(true);
  }
});
