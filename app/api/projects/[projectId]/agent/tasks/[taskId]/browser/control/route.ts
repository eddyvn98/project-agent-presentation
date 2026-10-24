import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { readProjectAgentTask } from "@/lib/project-agent/task-store";
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
  const request = parseHumanBrowserAction(await req.json().catch(() => null));
  if (!request) return NextResponse.json({ error: "Invalid browser control action" }, { status: 400, headers: HEADERS });
  const result = await humanBrowserOperation(task.id, task.conversationId ?? task.id, request);
  if ("error" in result) return NextResponse.json(result, { status: 409, headers: HEADERS });
  return NextResponse.json(result, { headers: HEADERS });
}
