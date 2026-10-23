import { abortTaskObservation, transientTaskStatus, waitForTaskPoll } from "./client-poll";
import type { PublicProjectAgentTask } from "./public-task";
import { xhrUpload } from "@/lib/upload-progress";
import { getProjectAgentConversationId, setProjectAgentConversationId } from "./conversation-session";

type ProjectAgentFetch = (
  input: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

interface RunProjectAgentTaskClientInput {
  projectId: string;
  userPrompt?: string;
  prompt: string;
  files?: File[];
  /** Files already saved as Project sources: the server copies them into the task, so they are not uploaded again. */
  sourceFiles?: Array<{ projectSourceId: string; name: string; mimeType: string; size: number }>;
  /** Upload progress of files[index], 0..1 (real network only). */
  onUploadProgress?: (index: number, fraction: number) => void;
	conversationId?: string | null;
  /** Model-step selector for this task; absent runs the default model. */
  modelSelector?: string;
  fetcher?: ProjectAgentFetch;
  pollIntervalMs?: number;
  /** Starts a goal on this chat: the agent keeps taking turns until the condition is met or a limit is reached. */
  goal?: { objective: string; condition?: string };
  /** Retrying a failed task: the server reuses that task's attachments. */
  retryOfTaskId?: string;
  maxPolls?: number;
  /** Stops client observation only; it does not cancel a server task. */
  signal?: AbortSignal;
  onProgress?: (task: PublicProjectAgentTask) => void;
}

function isNetworkError(cause: unknown): boolean {
  return cause instanceof TypeError || (cause instanceof Error && /failed to fetch|network/i.test(cause.message));
}

function parseTaskResponse(data: unknown): { task?: PublicProjectAgentTask; error?: string } {
  if (!data || typeof data !== "object") return {};
  return data as { task?: PublicProjectAgentTask; error?: string };
}

async function readTaskResponse(res: Awaited<ReturnType<ProjectAgentFetch>>): Promise<PublicProjectAgentTask> {
  const data = parseTaskResponse(await res.json().catch(() => ({})));
  if (!res.ok || !data.task || typeof data.task.id !== "string" || !data.task.id || typeof data.task.projectId !== "string" || !["queued", "running", "done", "failed"].includes(data.task.status)) {
    throw new Error(data.error ?? `Project Agent failed: ${res.status}`);
  }
  return data.task;
}

export async function runProjectAgentTaskFromClient({
  projectId,
  userPrompt,
  prompt,
  files = [],
  sourceFiles = [],
  onUploadProgress,
  conversationId,
  modelSelector,
  goal,
  retryOfTaskId,
  fetcher = fetch,
  pollIntervalMs = 1_500,
  maxPolls = 1_200,
  onProgress,
  signal,
}: RunProjectAgentTaskClientInput): Promise<PublicProjectAgentTask> {
  abortTaskObservation(signal);
  const projectPath = `/api/projects/${encodeURIComponent(projectId)}/agent/tasks`;
  const selectedConversationId = conversationId === null ? undefined : conversationId ?? getProjectAgentConversationId(projectId);
  type InputFile = { id: string; name: string; mimeType: string; size: number; projectSourceId?: string };
  const uploadedFiles: InputFile[] = [];
  for (const [index, file] of files.entries()) {
    abortTaskObservation(signal);
    const headers = { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name), "X-File-Type": file.type || "application/octet-stream" };
    const real = fetcher === fetch && onUploadProgress !== undefined;
    const sent = real
      ? await xhrUpload(`${projectPath}/uploads`, { headers, body: file, onProgress: (fraction) => onUploadProgress(index, fraction) })
      : await (async () => { const response = await fetcher(`${projectPath}/uploads`, { method: "POST", headers, body: file, signal }); return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) }; })();
    const upload = parseTaskResponse(sent.data) as { file?: InputFile; error?: string };
    if (!sent.ok || !upload.file) throw new Error(upload.error ?? `Attachment upload failed: ${sent.status}`);
    uploadedFiles.push(upload.file);
  }
  for (const source of sourceFiles) uploadedFiles.push({ id: crypto.randomUUID(), name: source.name, mimeType: source.mimeType, size: source.size, projectSourceId: source.projectSourceId });
  abortTaskObservation(signal);
  const createRes = await fetcher(projectPath, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, ...(userPrompt ? { userPrompt } : {}), ...(selectedConversationId ? { conversationId: selectedConversationId } : {}), ...(modelSelector ? { modelSelector } : {}), ...(goal ? { goal } : {}), ...(retryOfTaskId ? { retryOfTaskId } : {}), ...(uploadedFiles.length ? { inputFiles: uploadedFiles } : {}) }),
  });

  const reportTask = (value: PublicProjectAgentTask) => {
    if (value.conversationId) setProjectAgentConversationId(projectId, value.conversationId);
    onProgress?.(value);
    return value;
  };
  const created = await readTaskResponse(createRes);
  if (created.projectId !== projectId) throw new Error("Unexpected Project Agent project response");
  let task = reportTask(created);
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (task.status === "done" || task.status === "failed") return task;

    await waitForTaskPoll(pollIntervalMs, signal);
    const pollUrl = `/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(task.id)}`;
    let pollRes: Awaited<ReturnType<ProjectAgentFetch>> | undefined;
    for (let retry = 0; retry < 3; retry += 1) {
      try {
        abortTaskObservation(signal);
        pollRes = await fetcher(pollUrl, { signal });
        if (!transientTaskStatus(pollRes.status) || retry === 2) break;
      } catch (cause) {
        if (!isNetworkError(cause) || retry === 2) throw cause;
      }
      await waitForTaskPoll(pollIntervalMs * (retry + 1), signal);
    }
    if (!pollRes) throw new Error("Project Agent task status is temporarily unavailable");
    const next = await readTaskResponse(pollRes);
    if (next.id !== task.id || next.projectId !== projectId) throw new Error("Unexpected Project Agent task response");
    task = reportTask(next);
  }

  return task;
}

export function formatProjectAgentTaskMessage(
  _projectId: string,
  task: PublicProjectAgentTask,
): { content: string; error: boolean } {
  if (task.status === "done") {
    return {
      content: task.resultText ?? "Dify Project Agent completed without a response.",
      error: false,
    };
  }

  if (task.status === "queued" || task.status === "running") {
    return {
      content: `${task.progress ?? "Project Agent is still working."}\n\nThis task is still running. You can find it in Project Agent history.`,
      error: false,
    };
  }

  return {
    content: `Project Agent task ${task.status}: \`${task.id}\`${task.error ? `\n\n${task.error}` : ""}`,
    error: task.status === "failed",
  };
}
