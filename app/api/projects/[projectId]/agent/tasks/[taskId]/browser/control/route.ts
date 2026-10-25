import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { readProjectAgentTask } from "@/lib/project-agent/task-store";
import { beginPersonalLogin, enterPersonalLoginSecret, submitPersonalLoginField, savePersonalLogin, revokePersonalLogin, personalLoginStatus } from "@/lib/project-agent/runtime/browser-agent/personal-auth";
import { humanBrowserOperation, parseHumanBrowserAction } from "@/lib/project-agent/runtime/browser-agent/manual";
import * as projectCap from "@/lib/capabilities/project";
import { p7QaRequestOrigin } from "@/lib/project-agent/p7-qa-guard";
import { P8_QA_OPERATIONS, p8QaSessionAllowed } from "@/lib/project-agent/p8-qa-session-guard";
import { prepareP8QaBrowser, p8QaBrowserProbe, runP8QaBrowserStep,
  cleanupP8QaBrowser } from "@/lib/project-agent/runtime/browser-agent/p8-qa-fixture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(req: NextRequest,
  { params }: { params: { projectId: string; taskId: string } }) {
  const origin = req.headers.get("origin");
  if (!origin) return NextResponse.json({ error: "Origin required for browser control" }, { status: 403, headers: HEADERS });
  try {
    if (new URL(origin).origin !== req.nextUrl.origin)
      return NextResponse.json({ error: "Cross-origin control denied" }, { status: 403, headers: HEADERS });
  } catch { return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers: HEADERS }); }
  const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
  if (auth.response) return auth.response;
  const task = await readProjectAgentTask(params.taskId);
  if (!task || task.projectId !== params.projectId || task.ownerEmail.trim().toLowerCase() !== auth.callerEmail!.trim().toLowerCase())
    return NextResponse.json({ error: "Browser session not found" }, { status: 404, headers: HEADERS });
  if (task.status !== "running" && task.status !== "queued")
    return NextResponse.json({ error: "Task is no longer running" }, { status: 409, headers: HEADERS });
  if (process.env.PROJECT_AGENT_RUNTIME !== "sandbox" || process.env.PROJECT_AGENT_BROWSER_AGENT !== "1")
    return NextResponse.json({ error: "Browser control is not enabled" }, { status: 409, headers: HEADERS });
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (typeof raw?.op === "string" && P8_QA_OPERATIONS.has(raw.op)) {
    const owner = auth.callerEmail!.trim().toLowerCase();
    const project = await projectCap.getProject(params.projectId, auth.ownerEmail!);
    const context = {
      runtime: process.env.PROJECT_AGENT_RUNTIME,
      browser: process.env.PROJECT_AGENT_BROWSER_AGENT,
      fixture: process.env.PROJECT_AGENT_P7_QA_FIXTURE,
      nodeEnv: process.env.NODE_ENV,
      projectId: params.projectId, projectName: project.data?.name ?? "",
      owner, requestOrigin: req.nextUrl.origin,
      origin: p7QaRequestOrigin(req.method, origin, req.nextUrl.origin),
      expectedProjectId: process.env.PROJECT_AGENT_P7_QA_PROJECT_ID,
    };
    const allowed = auth.ownerEmail?.trim().toLowerCase() === owner && project.ok &&
      p8QaSessionAllowed(context, task, {
        enabled: process.env.PROJECT_AGENT_P8_QA_SESSION,
        loop: process.env.PROJECT_AGENT_P8_LOOP,
        isolated: process.env.P8_QA_ISOLATED_HOST,
        allowedOrigin: process.env.P8_QA_ALLOWED_ORIGIN,
      });
    if (!allowed) return NextResponse.json({ error: "Isolated P8 synthetic QA disabled" },
      { status: 403, headers: HEADERS });
    try {
      if (raw.op === "qa_prepare")
        return NextResponse.json(await prepareP8QaBrowser(task.id, owner), { headers: HEADERS });
      if (raw.op === "qa_probe")
        return NextResponse.json(p8QaBrowserProbe(task.id), { headers: HEADERS });
      if (raw.op === "qa_cleanup") {
        await cleanupP8QaBrowser(task.id);
        return NextResponse.json({ ok: true, connected: false }, { headers: HEADERS });
      }
      if (raw.kind !== "click" && raw.kind !== "no_progress")
        return NextResponse.json({ error: "Invalid synthetic step" }, { status: 400, headers: HEADERS });
      return NextResponse.json(
        await runP8QaBrowserStep(task.id, owner, task.projectId, raw.kind),
        { headers: HEADERS });
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message.slice(0, 140) : "Synthetic QA action failed",
      }, { status: 409, headers: HEADERS });
    }
  }
  const loginOp = typeof raw?.op === "string" && ["login_status","login_begin","login_secret","login_submit","login_save","login_revoke"].includes(raw.op);
  if (loginOp) {
    const { activeBrowserSession } = await import("@/lib/project-agent/runtime/browser-agent/session");
    const { browserControlState } = await import("@/lib/project-agent/runtime/browser-agent/control");
    const session = activeBrowserSession(task.id);
    if (!session || (session.owner && session.owner !== task.ownerEmail.trim().toLowerCase()))
      return NextResponse.json({ error: "Browser owner mismatch or session unavailable" }, { status: 409, headers: HEADERS });
    if (raw!.op !== "login_status" && raw!.op !== "login_revoke" && !browserControlState(task.id).paused)
      return NextResponse.json({ error: "Take control before login" }, { status: 409, headers: HEADERS });
    if (raw!.op === "login_secret" && (typeof raw!.text !== "string" || raw!.text.length > 2048))
      return NextResponse.json({ error: "Invalid private login entry" }, { status: 400, headers: HEADERS });
    if (raw!.op === "login_save" && (!["read","interact"].includes(String(raw!.mode)) || (raw!.relatedHosts !== undefined && (!Array.isArray(raw!.relatedHosts) || raw!.relatedHosts.length > 4 || raw!.relatedHosts.some((v: unknown) => typeof v !== "string" || v.length > 255)))))
      return NextResponse.json({ error: "Invalid grant mode" }, { status: 400, headers: HEADERS });
    if (raw!.op === "login_revoke" && typeof raw!.url !== "string")
      return NextResponse.json({ error: "Website URL required" }, { status: 400, headers: HEADERS });
    try {
      const request = raw!;
      const owner = task.ownerEmail, browserId = task.id;
      if (request.op === "login_status") return NextResponse.json(await personalLoginStatus(browserId, owner), { headers: HEADERS });
      if (request.op === "login_begin") return NextResponse.json(await beginPersonalLogin(browserId, owner), { headers: HEADERS });
      if (request.op === "login_secret") return NextResponse.json(await enterPersonalLoginSecret(browserId, owner, request.text as string), { headers: HEADERS });
      if (request.op === "login_submit") return NextResponse.json(await submitPersonalLoginField(browserId, owner), { headers: HEADERS });
      if (request.op === "login_save") return NextResponse.json(await savePersonalLogin(browserId, owner, request.mode as "read" | "interact", request.automation === true, Array.isArray(request.relatedHosts) ? request.relatedHosts as string[] : []), { headers: HEADERS });
      return NextResponse.json(await revokePersonalLogin(owner, request.url as string), { headers: HEADERS });
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Personal login failed" }, { status: 409, headers: HEADERS }); }
  }
  const request = parseHumanBrowserAction(raw);
  if (!request) return NextResponse.json({ error: "Invalid browser control action" }, { status: 400, headers: HEADERS });
  const result = await humanBrowserOperation(task.id, task.id, request);
  if ("error" in result) return NextResponse.json(result, { status: 409, headers: HEADERS });
  return NextResponse.json(result, { headers: HEADERS });
}
