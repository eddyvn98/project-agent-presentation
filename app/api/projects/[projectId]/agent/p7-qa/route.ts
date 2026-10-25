import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import * as projectCap from "@/lib/capabilities/project";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { createProjectAgentTask, deleteProjectAgentConversation, readProjectAgentTask,
  updateProjectAgentTask, writeProjectAgentFile } from "@/lib/project-agent/task-store";
import { p7QaAllowed, p7QaRequestOrigin, p7SyntheticTask, P7_QA_PREFIX } from "@/lib/project-agent/p7-qa-guard";
import { recoverP7SyntheticBrowser, withP7SyntheticRecoverySlot } from "@/lib/project-agent/p7-qa-recovery";
import { PROJECT_AGENT_BOOT_ID } from "@/lib/project-agent/boot";
import { markP7BrowserRunningIfCurrent, verifyP7TaskStoreMapping } from "@/lib/project-agent/p7-qa-conditional-update";
import { cleanupP7DiscardedBrowser } from "@/lib/project-agent/p7-qa-browser-cleanup";
import { p7SyntheticPdf } from "@/lib/project-agent/p7-synthetic-pdf";
import { prepareP7BrowserFixture } from "@/lib/project-agent/runtime/browser-agent/p7-fixture";
import { closeBrowserSession } from "@/lib/project-agent/runtime/browser-agent/session";
import { setBrowserWatch } from "@/lib/project-agent/runtime/browser-agent/watch";
import { clearBrowserControl } from "@/lib/project-agent/runtime/browser-agent/control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const reply = (value: object, status = 200) => NextResponse.json(value, { status, headers });
async function authorized(req: NextRequest, projectId: string) {
  const auth = await resolveProjectRequestAccess(req, projectId, "CHAT");
  if (auth.response) return { response: auth.response };
  const owner = auth.callerEmail?.trim().toLowerCase() ?? "";
  const project = await projectCap.getProject(projectId, auth.ownerEmail!);
  // Synthetic fixtures belong only to the initiating Project owner, never collaborators.
  const permitted = auth.ownerEmail?.trim().toLowerCase() === owner &&
    project.ok && Boolean(project.data) && p7QaAllowed({
    runtime: process.env.PROJECT_AGENT_RUNTIME, browser: process.env.PROJECT_AGENT_BROWSER_AGENT,
    fixture: process.env.PROJECT_AGENT_P7_QA_FIXTURE, nodeEnv: process.env.NODE_ENV,
    projectId, projectName: project.data?.name ?? "", owner,
    origin: p7QaRequestOrigin(req.method, req.headers.get("origin"), req.nextUrl.origin),
    requestOrigin: req.nextUrl.origin, expectedProjectId: process.env.PROJECT_AGENT_P7_QA_PROJECT_ID,
  });
  return permitted ? { owner } : { response: reply({ error: "P7 synthetic QA is disabled" }, 403) };
}
/** Dev-only synthetic task: intentionally does NOT start Dify or a worker. */
export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const allowed = await authorized(req, params.projectId);
  if (allowed.response) return allowed.response;
  const body = await req.json().catch(() => null) as { kind?: unknown } | null;
  if (!["browser", "pdf", "p8_browser"].includes(String(body?.kind))) return reply({ error: "Expected browser, pdf or p8_browser" }, 400);
  if (body?.kind === "p8_browser" &&
      (process.env.PROJECT_AGENT_P8_QA_SESSION !== "1" || process.env.PROJECT_AGENT_P8_LOOP !== "1"))
    return reply({ error: "P8 synthetic session fixture disabled" }, 403);
  const owner = allowed.owner!, kind = body.kind;
  const task = await createProjectAgentTask({ projectId: params.projectId, ownerEmail: owner,
    prompt: `${P7_QA_PREFIX} ${kind === "p8_browser" ? "p8 browser" : kind} fixture - local synthetic data only`,
    userPrompt: `Synthetic P7 ${kind} fixture`, projectOwnerEmail: owner });
  try {
    if (kind === "p8_browser") {
      // Create the task record ONLY. The /browser/control route creates the
      // active session in its own module/process for genuine takeover QA.
      await updateProjectAgentTask(task.id, { status: "running", logLine: "p8_synthetic :: session not yet opened" });
      return reply({ taskId: task.id, kind, prepared: false }, 201);
    }
    if (kind === "browser") {
      await updateProjectAgentTask(task.id, { status: "running", logLine: "p7_synthetic :: browser fixture" });
      const prepared = await prepareP7BrowserFixture(task.id, owner);
      return reply({ taskId: task.id, kind, ...prepared }, 201);
    }
    const bytes = p7SyntheticPdf(), fileId = randomUUID();
    await writeProjectAgentFile(task.id, fileId, bytes);
    await updateProjectAgentTask(task.id, { status: "done", resultText: "P7 synthetic PDF artifact",
      completedAt: new Date().toISOString(), filesExpireAt: new Date(Date.now() + 3600000).toISOString(),
      files: [{ id: fileId, name: "p7-synthetic.pdf", mimeType: "application/pdf", size: bytes.length }],
      logLine: "p7_synthetic :: pdf artifact" });
    return reply({ taskId: task.id, fileId, kind }, 201);
  } catch (error) {
    await closeBrowserSession(task.id).catch(() => {});
    setBrowserWatch(task.id, false);
    await deleteProjectAgentConversation(params.projectId, owner, { taskId: task.id }).catch(() => {});
    return reply({ error: error instanceof Error ? error.message.slice(0, 160) : "QA fixture failed" }, 503);
  }
}
/** Only deletes synthetic task records belonging to this exact owner and Project. */
export async function DELETE(req: NextRequest, { params }: { params: { projectId: string } }) {
  const allowed = await authorized(req, params.projectId);
  if (allowed.response) return allowed.response;
  const body = await req.json().catch(() => null) as { taskId?: unknown } | null;
  if (typeof body?.taskId !== "string" || !/^pat_[a-f0-9]{12}$/.test(body.taskId))
    return reply({ error: "Invalid synthetic task id" }, 400);
  const task = await readProjectAgentTask(body.taskId);
  if (!task || !p7SyntheticTask(task, params.projectId, allowed.owner!))
    return reply({ error: "Synthetic task not found" }, 404);
  await closeBrowserSession(task.id).catch(() => {});
  setBrowserWatch(task.id, false); clearBrowserControl(task.id);
  const removed = await deleteProjectAgentConversation(params.projectId, allowed.owner!, { taskId: task.id });
  return reply({ ok: removed === 1, removed });
}
/** Crash only the sole browser session in the isolated QA process, never a shared employee browser. */
export async function PATCH(req: NextRequest, { params }: { params: { projectId: string } }) {
  const allowed = await authorized(req, params.projectId);
  if (allowed.response) return allowed.response;
  const body = await req.json().catch(() => null) as { kind?: unknown; taskId?: unknown } | null;
  if (typeof body?.taskId !== "string") return reply({ error: "Task id required" }, 400);
  const task = await readProjectAgentTask(body.taskId);
  if (!task || !p7SyntheticTask(task, params.projectId, allowed.owner!))
    return reply({ error: "Synthetic task not found" }, 404);
  if (body.kind === "recover") {
    const { browserControlState } = await import("@/lib/project-agent/runtime/browser-agent/control");
    try {
      const recovered = await withP7SyntheticRecoverySlot(task.id, () => recoverP7SyntheticBrowser({
        task, projectId: params.projectId, owner: allowed.owner!,
        controlPaused: () => browserControlState(task.id).paused,
        prepare: () => prepareP7BrowserFixture(task.id, allowed.owner!),
        readTask: () => readProjectAgentTask(task.id),
        markRunning: latest => markP7BrowserRunningIfCurrent(latest, PROJECT_AGENT_BOOT_ID),
        cleanup: () => cleanupP7DiscardedBrowser(task.id).then(() => {}),
      }));
      if (!recovered) return reply({ error: "Synthetic browser recovery already in progress" }, 409);
      if (!recovered.ok) return reply({ error: recovered.reason === "human_takeover" ?
        "Release human browser control before recovering the fixture" :
        "Synthetic browser task was stopped or changed during recovery" }, 409);
      return reply({ taskId: task.id, ...recovered.frame });
    } catch {
      return reply({ error: "Synthetic browser recovery failed" }, 503);
    }
  }
  if (body.kind !== "crash" || process.env.PROJECT_AGENT_P7_QA_CRASH !== "1")
    return reply({ error: "QA crash injection is disabled" }, 403);
  const { activeBrowserSession, browserResourceSnapshot } = await import("@/lib/project-agent/runtime/browser-agent/session");
  const session = activeBrowserSession(task.id);
  const counters = browserResourceSnapshot();
  if (!session || counters.activeSessions !== 1 || counters.pendingSessions !== 0)
    return reply({ error: "Only one isolated QA browser session may be crashed" }, 409);
  await session.browser.close();
  return reply({ ok: true, disconnected: !session.browser.isConnected() });
}
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const allowed = await authorized(req, params.projectId);
  if (allowed.response) return allowed.response;
  const id = req.nextUrl.searchParams.get("taskId") ?? "";
  const task = /^pat_[a-f0-9]{12}$/.test(id) ? await readProjectAgentTask(id) : null;
  if (!task || !p7SyntheticTask(task, params.projectId, allowed.owner!))
    return reply({ error: "Synthetic task not found" }, 404);
  if (req.nextUrl.searchParams.get("verifyCas") === "1") {
    const matched = await verifyP7TaskStoreMapping(task).catch(() => false);
    return reply({ taskId: task.id, casMappingVerified: matched }, matched ? 200 : 409);
  }
  const { activeBrowserSession } = await import("@/lib/project-agent/runtime/browser-agent/session");
  const session = activeBrowserSession(id);
  if (!session?.browser.isConnected()) return reply({ taskId: id, connected: false });
  const count = await session.page.locator("#qa-output").textContent().catch(() => null);
  return reply({ taskId: id, connected: true, count, hasFrame: Boolean(session.page) });
}
