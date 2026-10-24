import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { readProjectAgentTask } from "@/lib/project-agent/task-store";
import { browserWatchImage, browserWatchStatus, captureBrowserWatch, setBrowserWatch } from "@/lib/project-agent/runtime/browser-agent/watch";
import { activeBrowserSession } from "@/lib/project-agent/runtime/browser-agent/session";
import { browserControlState, releaseBrowserControl } from "@/lib/project-agent/runtime/browser-agent/control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

type Params = { params: { projectId: string; taskId: string } };
async function authorize(req: NextRequest, projectId: string, taskId: string) {
  const auth = await resolveProjectRequestAccess(req, projectId, "CHAT");
  if (auth.response) return { response: auth.response };
  const task = await readProjectAgentTask(taskId);
  // A collaborator can view the Project chat, but NOT another person's authenticated browser frames.
  if (!task || task.projectId !== projectId || task.ownerEmail.toLowerCase() !== auth.callerEmail?.toLowerCase()) {
    return { response: NextResponse.json({ error: "Browser preview not found" }, { status: 404, headers: HEADERS }) };
  }
  return { task };
}

/** The watch is opt-in, ephemeral, and read-only. Only the initiating user gets frames. */
export async function GET(req: NextRequest, { params }: Params) {
  const checked = await authorize(req, params.projectId, params.taskId);
  if (checked.response) return checked.response;
  if (req.nextUrl.searchParams.get("image") === "1") {
    const bytes = browserWatchImage(params.taskId);
    if (!bytes) return new NextResponse(null, { status: 404, headers: HEADERS });
    return new NextResponse(new Uint8Array(bytes), {
      headers: { ...HEADERS, "Content-Type": "image/jpeg", "Content-Disposition": "inline" },
    });
  }
  return NextResponse.json({ preview: browserWatchStatus(params.taskId), control: browserControlState(params.taskId) }, { headers: HEADERS });
}

export async function POST(req: NextRequest, { params }: Params) {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== req.nextUrl.origin) return NextResponse.json({ error: "Cross-origin watch denied" }, { status: 403, headers: HEADERS });
    } catch { return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers: HEADERS }); }
  }
  const checked = await authorize(req, params.projectId, params.taskId);
  if (checked.response) return checked.response;
  const body = await req.json().catch(() => null) as { watch?: unknown } | null;
  if (typeof body?.watch !== "boolean") {
    return NextResponse.json({ error: "Expected watch: boolean" }, { status: 400, headers: HEADERS });
  }
  if (body.watch && (process.env.PROJECT_AGENT_RUNTIME !== "sandbox" || process.env.PROJECT_AGENT_BROWSER_AGENT !== "1")) return NextResponse.json({ error: "Browser Agent is not enabled" }, { status: 409, headers: HEADERS });
  if (body.watch && !["queued", "running"].includes(checked.task!.status)) {
    return NextResponse.json({ error: "Only active tasks can start a browser watch" }, { status: 409, headers: HEADERS });
  }
  if (!body.watch) releaseBrowserControl(params.taskId);
  setBrowserWatch(params.taskId, body.watch);
  if (body.watch) {
    // No browser launch: capture only the session which the agent has already created.
    const existing = activeBrowserSession(checked.task!.conversationId ?? checked.task!.id);
    if (existing) await captureBrowserWatch(params.taskId, existing.page, "watch started");
  }
  return NextResponse.json({ preview: browserWatchStatus(params.taskId) }, { headers: HEADERS });
}
