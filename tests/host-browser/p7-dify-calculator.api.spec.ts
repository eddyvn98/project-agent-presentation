import { test, expect } from "@playwright/test";
import { getTask, taskBase, waitTask } from "./qa-helpers";

/** Real Dify bridge smoke test: requires a dedicated safe QA Project and provider access. */
test("arithmetic result has an actual calculator execution receipt", async ({ request }) => {
  test.skip(process.env.P7_ALLOW_TASK_CREATION !== "1" || process.env.P7_EXPECT_CALCULATOR !== "1",
    "Set P7_ALLOW_TASK_CREATION=1 and P7_EXPECT_CALCULATOR=1 for real Dify calculator acceptance");
  test.setTimeout(240_000);
  const response = await request.post(taskBase(), { failOnStatusCode: false, data: {
    prompt: "[P7 calculator QA] Calculate exactly 59*26*47000-72000000. Use the app calculator if available. Do not search the web, access websites, or create files. Return only the expression and exact result.",
  } });
  expect(response.status()).toBe(202);
  const task = (await response.json() as { task: { id: string } }).task;
  expect(task.id).toMatch(/^pat_/);
  const finished = await waitTask(request, task.id);
  expect(finished.status, finished.error ?? "No task error").toBe("done");
  const detail = await getTask(request, task.id) as typeof finished & {
    steps?: string[]; activity?: Array<{ label: string }> };
  const compact = (detail.resultText ?? "").replace(/[\s,_]/g, "");
  expect(compact).toContain("98000");
  const observed = [...(detail.steps ?? []), ...(detail.activity ?? []).map(entry => entry.label)].join(" ");
  expect(observed, "A numerical answer alone is not evidence the calculator executed").toMatch(/calculat/i);
});
