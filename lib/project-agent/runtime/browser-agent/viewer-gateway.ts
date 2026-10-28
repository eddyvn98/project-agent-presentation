import { timingSafeEqual } from "node:crypto";

// All paths come from the trusted reverse proxy, never from browser-supplied target URLs.
const PATH = /^\/private-steel-viewer\/projects\/([A-Za-z0-9_-]{4,128})\/player$/;
const ID = /^[A-Za-z0-9-]{8,80}$/;
export function viewerProjectFromPath(path: string): string | null {
  if (path.length > 240 || path.includes("?") || path.includes("#") ||
      path.includes("%") || path.includes("\\") || path.includes("//")) return null;
  return PATH.exec(path)?.[1] ?? null;
}
export function authorizedViewerGatewaySecret(provided: string | null): boolean {
  const expected = process.env.PROJECT_AGENT_STEEL_VIEWER_GATEWAY_SECRET;
  if (!expected || expected.length < 32 || !provided || provided.length !== expected.length)
    return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
export function steelPlayerUpstreamPath(steelId: string): string {
  if (!ID.test(steelId)) throw new Error("Invalid Steel player session ID");
  return "/v1/sessions/" + steelId + "/player";
}
export function privateProjectViewerUrl(projectId: string): string {
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(projectId))
    throw new Error("Invalid Project viewer path");
  return "/private-steel-viewer/projects/" + projectId + "/player";
}
