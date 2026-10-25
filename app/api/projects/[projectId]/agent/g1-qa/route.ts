import { NextRequest, NextResponse } from "next/server";
import * as projectCap from "@/lib/capabilities/project";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { createProjectAgentTask, readProjectAgentTask,
  deleteProjectAgentConversation } from "@/lib/project-agent/task-store";
import { p7QaAllowed, p7QaRequestOrigin } from "@/lib/project-agent/p7-qa-guard";
import { p8QaDedicatedOrigin } from "@/lib/project-agent/p8-qa-session-guard";
import { g1QaPrompt, isG1QaTask, type G1Scenario } from "@/lib/project-agent/runtime/g1-goal-check";
import { prepareP8QaBrowser, cleanupP8QaBrowser } from "@/lib/project-agent/runtime/browser-agent/p8-qa-fixture";
import { startProjectAgentTask } from "@/lib/project-agent/task-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: HEADERS });
function loopbackModelConfigured() {
  if (process.env.PROJECT_AGENT_DIFY_API_KEY !== "g1-local-only" ||
      process.env.PROJECT_AGENT_RUNTIME_DIFY_API_KEY !== "g1-local-only" ||
      process.env.PROJECT_AGENT_DURABLE_QUEUE !== "0") return false;
  for (const name of ["PROJECT_AGENT_DIFY_API_URL", "PROJECT_AGENT_RUNTIME_DIFY_API_URL"]) {
    try {
      const url = new URL(process.env[name] ?? "");
      if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" ||
          url.port !== "3998" || url.username || url.password) return false;
    } catch { return false; }
  }
  return true;
}
async function authorize(req: NextRequest, projectId: string) {
  const auth = await resolveProjectRequestAccess(req, projectId, "CHAT");
  if (auth.response) return { error: auth.response };
  const owner = auth.callerEmail?.trim().toLowerCase() ?? "";
  const project = await projectCap.getProject(projectId, auth.ownerEmail!);
  const context = {
    runtime: process.env.PROJECT_AGENT_RUNTIME, browser: process.env.PROJECT_AGENT_BROWSER_AGENT,
    fixture: process.env.PROJECT_AGENT_P7_QA_FIXTURE, nodeEnv: process.env.NODE_ENV,
    projectId, projectName: project.data?.name ?? "", owner, requestOrigin: req.nextUrl.origin,
    origin: p7QaRequestOrigin(req.method, req.headers.get("origin"), req.nextUrl.origin),
    expectedProjectId: process.env.PROJECT_AGENT_P7_QA_PROJECT_ID,
  };
  if (auth.ownerEmail?.trim().toLowerCase() !== owner || !project.ok ||
      process.env.PROJECT_AGENT_G1_QA !== "1" ||
      process.env.PROJECT_AGENT_P8_QA_SESSION !== "1" ||
      process.env.PROJECT_AGENT_P8_LOOP !== "1" ||
      process.env.PROJECT_AGENT_P8_LOOP_REPORT_ONLY !== "0" ||
      !p7QaAllowed(context) ||
      !p8QaDedicatedOrigin(req.nextUrl.origin, process.env.P8_QA_ALLOWED_ORIGIN,
        process.env.P8_QA_ISOLATED_HOST) ||
      !loopbackModelConfigured()) return { error: reply({ error: "G1 isolated QA disabled" }, 403) };
  return { owner };
}
export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const allowed = await authorize(req, params.projectId);
  if (allowed.error) return allowed.error;
  const body = await req.json().catch(() => null) as { scenario?: unknown } | null;
  if (body?.scenario !== "success" && body?.scenario !== "premature")
    return reply({ error: "Invalid G1 scenario" }, 400);
  const prompt = g1QaPrompt(body.scenario as G1Scenario);
  const task = await createProjectAgentTask({
    projectId: params.projectId, ownerEmail: allowed.owner!,
    projectOwnerEmail: allowed.owner!, prompt, userPrompt: prompt,
  });
  try {
    const prepared = await prepareP8QaBrowser(task.id, allowed.owner!);
    if (!prepared.connected || !prepared.hasFrame || prepared.networkAttempts !== 0)
      throw new Error("G1 synthetic Chromium failed to prepare");
    startProjectAgentTask(task.id);
    return reply({ taskId: task.id, nodePid: prepared.pid, prepared: true }, 201);
  } catch {
    await cleanupP8QaBrowser(task.id);
    await deleteProjectAgentConversation(params.projectId, allowed.owner!, { taskId: task.id });
    return reply({ error: "G1 fixture initialization failed" }, 503);
  }
}
export async function DELETE(req: NextRequest, { params }: { params: { projectId: string } }) {
  const allowed = await authorize(req, params.projectId);
  if (allowed.error) return allowed.error;
  const body = await req.json().catch(() => null) as { taskId?: unknown } | null;
  if (typeof body?.taskId !== "string" || !/^pat_[a-f0-9]{12}$/.test(body.taskId))
    return reply({ error: "Invalid synthetic task ID" }, 400);
  const task = await readProjectAgentTask(body.taskId);
  if (!task || task.projectId !== params.projectId ||
      task.ownerEmail.toLowerCase() !== allowed.owner || !isG1QaTask(task))
    return reply({ error: "G1 synthetic task not found" }, 404);
  if (!["done", "failed"].includes(task.status))
    return reply({ error: "G1 task still active; Stop through the regular task API first" }, 409);
  await cleanupP8QaBrowser(task.id);
  const removed = await deleteProjectAgentConversation(params.projectId, allowed.owner!, { taskId: task.id });
  return reply({ ok: removed === 1 });
}
