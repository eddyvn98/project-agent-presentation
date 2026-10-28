import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { findProjectRecord } from "@/lib/project-agent/runtime/browser-agent/project-registry";
import { projectBrowserKey } from "@/lib/project-agent/runtime/browser-agent/project-sessions";
import { authorizedViewerGatewaySecret, steelPlayerUpstreamPath,
  viewerProjectFromPath } from "@/lib/project-agent/runtime/browser-agent/viewer-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };
const deny = () => new NextResponse(null, { status: 403, headers });
/** Internal auth_request endpoint; never forward session IDs to public clients. */
export async function GET(req: NextRequest) {
  if (process.env.PROJECT_AGENT_STEEL_PRIVATE_VIEWER !== "1" ||
      process.env.PROJECT_AGENT_RUNTIME !== "sandbox" ||
      process.env.PROJECT_AGENT_STEEL_BROWSER !== "1" ||
      !authorizedViewerGatewaySecret(req.headers.get("x-viewer-gateway-secret")))
    return deny();
  const raw = req.headers.get("x-original-uri") ?? "";
  const projectId = viewerProjectFromPath(raw);
  if (!projectId) return deny();
  const access = await resolveProjectRequestAccess(req, projectId, "CHAT");
  if (access.response || !access.callerEmail) return deny();
  const owner = access.callerEmail.trim().toLowerCase();
  const session = await findProjectRecord(projectBrowserKey(projectId, owner), projectId, owner);
  if (!session?.steelId) return deny();
  return new NextResponse(null, { status: 204, headers: {
    ...headers, "X-Steel-Upstream-Path": steelPlayerUpstreamPath(session.steelId),
  } });
}
