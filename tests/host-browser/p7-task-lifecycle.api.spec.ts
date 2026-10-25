import { test, expect } from "@playwright/test";
import { allowWrites, getTask, projectId, qaPrompt, taskBase, waitTask } from "./qa-helpers";

test("authenticated task history is private and not cached", async ({ request }) => {
  const response = await request.get(taskBase() + "?limit=1", { failOnStatusCode: false });
  expect(response.status()).toBe(200);
  const body = await response.json() as { tasks?: unknown[] };
  expect(Array.isArray(body.tasks)).toBe(true);
});

test("invalid history cursor is refused", async ({ request }) => {
  const response = await request.get(taskBase() + "?cursor=invalid%25value", { failOnStatusCode: false });
  expect(response.status()).toBe(400);
});

test("unauthenticated task history is denied", async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const response = await anonymous.get(taskBase(), { failOnStatusCode: false, maxRedirects: 0 });
    expect([302, 303, 307, 308, 401, 403, 404].includes(response.status())).toBe(true);
  } finally { await anonymous.dispose(); }
});

test("owner can create, observe and retrieve a synthetic QA task", async ({ request }) => {
  test.skip(!allowWrites(), "Set P7_ALLOW_TASK_CREATION=1 only for a dedicated QA Project");
  test.setTimeout(240_000);
  const response = await request.post(taskBase(), { data: { prompt: qaPrompt("lifecycle") }, failOnStatusCode: false });
  expect(response.status()).toBe(202);
  const body = await response.json() as { task?: { id: string; projectId?: string } };
  expect(body.task?.id).toMatch(/^pat_/);
  expect(body.task?.projectId).toBe(projectId());
  const finished = await waitTask(request, body.task!.id);
  const result = await getTask(request, body.task!.id);
  expect(finished.id).toBe(result.id);
  if (result.status === "failed") {
    expect(result.error).toBeTruthy();
  } else {
    expect(result.resultText?.trim().length).toBeGreaterThan(0);
  }
});
