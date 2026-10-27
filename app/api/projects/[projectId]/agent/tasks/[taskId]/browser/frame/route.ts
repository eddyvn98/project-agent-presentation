import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { readProjectAgentTask } from "@/lib/project-agent/task-store";
import { resolveTaskBrowser } from "@/lib/project-agent/runtime/browser-agent/task-browser";
import { sharedBrowserWatchAllowed } from "@/lib/project-agent/runtime/browser-agent/watch-access-db";
import { captureSharedFrame } from "@/lib/project-agent/runtime/browser-agent/shared-frame";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, no-transform",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
export async function GET(req: NextRequest,
  { params }: { params: { projectId: string; taskId: string } }) {
  const access = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
  if (access.response) return access.response;
  const task = await readProjectAgentTask(params.taskId);
  if (!task || task.projectId !== params.projectId ||
      task.ownerEmail.toLowerCase() !== access.callerEmail?.toLowerCase() ||
      !["queued", "running"].includes(task.status))
    return NextResponse.json({ error: "Browser frame unavailable" }, { status: 404, headers });
  if (!await sharedBrowserWatchAllowed(task.id, params.projectId, task.ownerEmail))
    return NextResponse.json({ error: "Browser watch not enabled" }, { status: 403, headers });
  try {
    const session = await resolveTaskBrowser(task.id, params.projectId, task.ownerEmail);
    if (!session?.persistent || session.owner !== task.ownerEmail.toLowerCase())
      return NextResponse.json({ error: "Shared browser unavailable" }, { status: 409, headers });
    const { bytes, frameId } = await captureSharedFrame(session, task.id, task.ownerEmail);
    return new NextResponse(new Uint8Array(bytes), { headers: {
      ...headers, "Content-Type": "image/jpeg", "X-Browser-Frame-Id": frameId,
    } });
  } catch {
    return NextResponse.json({ error: "Browser frame changed; retry" }, { status: 409, headers });
  }
}
