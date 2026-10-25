import { expect, type APIRequestContext } from "@playwright/test";
export const projectId = () => {
  const id = process.env.P7_PROJECT_ID;
  if (!id || !/^[\w-]{4,128}$/.test(id)) throw new Error("Set P7_PROJECT_ID to a dedicated QA Project");
  return id;
};
export const taskBase = () => `/api/projects/${encodeURIComponent(projectId())}/agent/tasks`;
export const allowWrites = () => process.env.P7_ALLOW_TASK_CREATION === "1";
export const allowControl = () => process.env.P7_ALLOW_BROWSER_CONTROL === "1";
export const qaPrompt = (name: string) => `[P7 QA / ${name}] ${process.env.P7_SAFE_PROMPT ?? "Explain two advantages of accessible headings. Do not modify any external sites or files."}`;
export async function getTask(request: APIRequestContext, id: string) {
  const response = await request.get(`${taskBase()}/${encodeURIComponent(id)}`, { failOnStatusCode: false });
  expect(response.ok(), `Task GET returned ${response.status()}`).toBeTruthy();
  return (await response.json() as { task: { id: string; status: string; resultText?: string; error?: string; files?: unknown[] } }).task;
}
export async function waitTask(request: APIRequestContext, id: string, timeoutMs = 150_000) {
  const began = Date.now();
  let last = await getTask(request, id);
  while (["running", "queued"].includes(last.status) && Date.now() - began < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 1200));
    last = await getTask(request, id);
  }
  expect(["done", "failed"].includes(last.status), `Unfinished task ${id}: ${last.status}`).toBeTruthy();
  return last;
}

/** Never mutate a real agent task; rehydrate only an explicit dev synthetic fixture. */
export async function restoreSyntheticBrowserFixture(request: APIRequestContext, baseURL?: string) {
  if (process.env.P7_SYNTHETIC_BROWSER_TASK !== "1") return;
  const taskId = process.env.P7_RUNNING_BROWSER_TASK_ID;
  if (!taskId || !baseURL) throw new Error("Synthetic browser recovery requires task ID and QA origin");
  const endpoint = `/api/projects/${encodeURIComponent(projectId())}/agent/p7-qa`;
  const response = await request.patch(endpoint, {
    headers: { Origin: new URL(baseURL).origin }, data: { kind: "recover", taskId },
    failOnStatusCode: false,
  });
  expect(response.status(), "Synthetic browser rehydration failed").toBe(200);
  expect((await response.json() as { hasFrame: boolean }).hasFrame).toBe(true);
}
