import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { taskBase, projectId, waitTask } from "./qa-helpers";
const fixture = () => `/api/projects/${encodeURIComponent(projectId())}/agent/p7-qa`;
test("Stop safely terminates a synthetic browser task", async ({ request, baseURL }) => {
  test.skip(process.env.P7_ALLOW_QA_STOP !== "1", "Requires isolated synthetic QA and P7_ALLOW_QA_STOP=1");
  const headers = { Origin: new URL(baseURL!).origin };
  const created = await request.post(fixture(), { headers, data: { kind: "browser" }, failOnStatusCode: false });
  expect(created.status()).toBe(201);
  const id = (await created.json() as { taskId: string }).taskId;
  try {
    const stopped = await request.post(`${taskBase()}/${id}/stop`, { headers, failOnStatusCode: false });
    expect(stopped.status()).toBe(200);
    const detail = await (await request.get(`${taskBase()}/${id}`)).json() as
      { task: { status: string } };
    expect(detail.task.status).toBe("failed");
  } finally {
    const deleted = await request.delete(fixture(), { headers, data: { taskId: id }, failOnStatusCode: false });
    expect(deleted.ok()).toBe(true);
  }
});
test("three concurrent requests with identical UUID return one task", async ({ request }) => {
  test.skip(process.env.P7_ALLOW_TASK_CREATION !== "1" || process.env.P7_TEST_IDEMPOTENCY !== "1",
    "Requires explicit synthetic task and HTTP idempotency opt-in");
  test.setTimeout(240_000);
  const key = randomUUID(), data = {
    prompt: "[P7 synthetic QA] Answer: accessible labels improve keyboard navigation. No external actions.",
  };
  const replies = await Promise.all(Array.from({ length: 3 }, () =>
    request.post(taskBase(), { headers: { "Idempotency-Key": key }, data, failOnStatusCode: false })));
  expect(replies.map(reply => reply.status())).toEqual([202, 202, 202]);
  const ids = await Promise.all(replies.map(async reply =>
    (await reply.json() as { task: { id: string } }).task.id));
  expect(new Set(ids).size).toBe(1);
  const conflict = await request.post(taskBase(), { headers: { "Idempotency-Key": key },
    data: { prompt: "A different payload" }, failOnStatusCode: false });
  expect(conflict.status()).toBe(409);
  await waitTask(request, ids[0]);
});
test("Retry stores a new task ID with provenance from a synthetic artifact", async ({ request }) => {
  test.skip(process.env.P7_ALLOW_TASK_CREATION !== "1" || !process.env.P7_EXISTING_FILE_TASK_ID,
    "Requires synthetic artifact and task creation opt-in");
  test.setTimeout(240_000);
  const source = process.env.P7_EXISTING_FILE_TASK_ID!;
  const response = await request.post(taskBase(), { data: {
    prompt: "[P7 QA] Summarize the synthetic PDF. No browser or external side effects.",
    retryOfTaskId: source,
  }, failOnStatusCode: false });
  expect(response.status()).toBe(202);
  const id = (await response.json() as { task: { id: string } }).task.id;
  expect(id).not.toBe(source);
  const outcome = await waitTask(request, id);
  expect(["done", "failed"]).toContain(outcome.status);
});
