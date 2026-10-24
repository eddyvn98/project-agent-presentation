import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { readProjectAgentTask } from "@/lib/project-agent/task-store";
import { activeBrowserSession } from "@/lib/project-agent/runtime/browser-agent/session";
import { browserWatchStatus } from "@/lib/project-agent/runtime/browser-agent/watch";
import { sensitiveScreenshotMask } from "@/lib/project-agent/runtime/browser-agent/privacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, no-transform", "X-Content-Type-Options": "nosniff" };
/** Bounded MJPEG stream: browser process and this request must share a host; never proxies cookie/session data. */
export async function GET(req: NextRequest, { params }: {
  params: { projectId: string; taskId: string };
}) {
  const access = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
  if (access.response) return access.response;
  const task = await readProjectAgentTask(params.taskId);
  if (!task || task.projectId !== params.projectId ||
    task.ownerEmail.toLowerCase() !== access.callerEmail?.toLowerCase())
    return NextResponse.json({ error: "Browser stream not found" }, { status: 404, headers });
  const browser = activeBrowserSession(task.id);
  if (!browser || browser.owner !== task.ownerEmail.toLowerCase() ||
    !browserWatchStatus(task.id)?.watching || !["queued","running"].includes(task.status))
    return NextResponse.json({ error: "Browser stream unavailable" }, { status: 409, headers });
  const boundary = "projectagentframe";
  let stopped = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        const encoder = new TextEncoder();
        try {
          for (let i = 0; i < 22 && !stopped && !req.signal.aborted; i++) {
            if (!browserWatchStatus(task.id)?.watching || !browser.page || browser.page.isClosed()) break;
            try {
              const bytes = await browser.page.screenshot({
                type: "jpeg", quality: 48, animations: "disabled", timeout: 3500,
                mask: [sensitiveScreenshotMask(browser.page)], maskColor: "#64748b",
              });
              if (bytes.byteLength <= 600_000) {
                controller.enqueue(encoder.encode("--" + boundary +
                  "\r\nContent-Type: image/jpeg\r\nContent-Length: " + bytes.byteLength + "\r\n\r\n"));
                controller.enqueue(bytes);
                controller.enqueue(encoder.encode("\r\n"));
              }
            } catch { /* A navigation can temporarily invalidate a frame. */ }
            await new Promise(resolve => setTimeout(resolve, 650));
          }
        } finally {
          if (!stopped) { controller.enqueue(encoder.encode("--" + boundary + "--\r\n")); controller.close(); }
        }
      })().catch(() => { try { controller.close(); } catch { /* already aborted */ } });
    },
    cancel() { stopped = true; },
  });
  return new NextResponse(stream, { headers: {
    ...headers, "Content-Type": "multipart/x-mixed-replace; boundary=" + boundary,
    "X-Accel-Buffering": "no",
  } });
}
