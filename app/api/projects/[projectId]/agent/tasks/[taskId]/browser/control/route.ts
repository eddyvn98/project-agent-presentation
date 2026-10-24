import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { readProjectAgentTask } from "@/lib/project-agent/task-store";
import { beginPersonalLogin, enterPersonalLoginSecret, savePersonalLogin, revokePersonalLogin, personalLoginStatus } from "@/lib/project-agent/runtime/browser-agent/personal-auth";
import { humanBrowserOperation, parseHumanBrowserAction } from "@/lib/project-agent/runtime/browser-agent/manual";

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
  const loginOp = typeof raw?.op === "string" && ["login_status","login_begin","login_secret","login_save","login_revoke"].includes(raw.op);
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
    if (raw!.op === "login_save" && !["read","interact"].includes(String(raw!.mode)))
      return NextResponse.json({ error: "Invalid grant mode" }, { status: 400, headers: HEADERS });
    if (raw!.op === "login_revoke" && typeof raw!.url !== "string")
      return NextResponse.json({ error: "Website URL required" }, { status: 400, headers: HEADERS });
    try {
      const request = raw!;
      const owner = task.ownerEmail, browserId = task.id;
      if (request.op === "login_status") return NextResponse.json(await personalLoginStatus(browserId, owner), { headers: HEADERS });
      if (request.op === "login_begin") return NextResponse.json(await beginPersonalLogin(browserId, owner), { headers: HEADERS });
      if (request.op === "login_secret") return NextResponse.json(await enterPersonalLoginSecret(browserId, owner, request.text as string), { headers: HEADERS });
      if (request.op === "login_save") return NextResponse.json(await savePersonalLogin(browserId, owner, request.mode as "read" | "interact", request.automation === true), { headers: HEADERS });
      return NextResponse.json(await revokePersonalLogin(owner, request.url as string), { headers: HEADERS });
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Personal login failed" }, { status: 409, headers: HEADERS }); }
  }
  const request = parseHumanBrowserAction(raw);
  if (!request) return NextResponse.json({ error: "Invalid browser control action" }, { status: 400, headers: HEADERS });
  const result = await humanBrowserOperation(task.id, task.conversationId ?? task.id, request);
  if ("error" in result) return NextResponse.json(result, { status: 409, headers: HEADERS });
  return NextResponse.json(result, { headers: HEADERS });
}
