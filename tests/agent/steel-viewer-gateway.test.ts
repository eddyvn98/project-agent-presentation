import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/projects/api-access", () => ({ resolveProjectRequestAccess: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/browser-agent/project-registry", () => ({
  findProjectRecord: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/project-sessions", () => ({
  projectBrowserKey: vi.fn(() => "pb_synthetic"),
}));
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { findProjectRecord } from "../../lib/project-agent/runtime/browser-agent/project-registry";
import { GET } from "../../app/api/project-agent/steel-viewer/authorize/route";
import { authorizedViewerGatewaySecret, viewerProjectFromPath, privateProjectViewerUrl }
  from "../../lib/project-agent/runtime/browser-agent/viewer-gateway";

const secret = "synthetic-reverse-proxy-gateway-secret-123456789";
const id = "steel-session-synthetic-abcdef1234";
const path = "/private-steel-viewer/projects/qa-project-1/player";
function request(uri = path, key = secret) {
  return new NextRequest("https://host.example/api/project-agent/steel-viewer/authorize", {
    headers: { "x-original-uri": uri, "x-viewer-gateway-secret": key },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PROJECT_AGENT_RUNTIME", "sandbox");
  vi.stubEnv("PROJECT_AGENT_STEEL_BROWSER", "1");
  vi.stubEnv("PROJECT_AGENT_STEEL_PRIVATE_VIEWER", "1");
  vi.stubEnv("PROJECT_AGENT_STEEL_VIEWER_GATEWAY_SECRET", secret);
  vi.mocked(resolveProjectRequestAccess).mockResolvedValue({
    callerEmail: "owner@example.test", response: null,
  } as never);
  vi.mocked(findProjectRecord).mockResolvedValue({ steelId: id } as never);
});
afterEach(() => vi.unstubAllEnvs());
describe("Authenticated Steel viewer gateway", () => {
  it("resolves a strictly project-scoped URL and rejects URL injection", () => {
    expect(viewerProjectFromPath(path)).toBe("qa-project-1");
    expect(privateProjectViewerUrl("qa-project-1")).toBe(path);
    for (const invalid of [path + "?interactive=true", path + "#token",
      "/private-steel-viewer/projects/qa%2Fproject/player",
      "/private-steel-viewer/projects/qa-project-1/../../admin",
      "/private-steel-viewer/projects/qa-project-1/player/extra"]) {
      expect(viewerProjectFromPath(invalid)).toBeNull();
    }
  });
  it("requires an explicit shared gateway secret and every feature flag", async () => {
    expect(authorizedViewerGatewaySecret(secret)).toBe(true);
    expect(authorizedViewerGatewaySecret("invalid")).toBe(false);
    expect((await GET(request(path, "invalid"))).status).toBe(403);
    expect(resolveProjectRequestAccess).not.toHaveBeenCalled();
    vi.stubEnv("PROJECT_AGENT_STEEL_PRIVATE_VIEWER", "0");
    expect((await GET(request())).status).toBe(403);
  });
  it("never authorizes a nonmember or an owner without an active Steel record", async () => {
    vi.mocked(resolveProjectRequestAccess).mockResolvedValueOnce({
      response: new Response("Denied", { status: 404 }),
    } as never);
    expect((await GET(request())).status).toBe(403);
    vi.mocked(findProjectRecord).mockResolvedValueOnce(null);
    expect((await GET(request())).status).toBe(403);
  });
  it("grants only the active owner's exact player and leaks no session in the URL", async () => {
    const response = await GET(request());
    expect(response.status).toBe(204);
    expect(response.headers.get("X-Steel-Upstream-Path"))
      .toBe("/v1/sessions/" + id + "/player");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.text()).toBe("");
    expect(findProjectRecord).toHaveBeenCalledWith("pb_synthetic",
      "qa-project-1", "owner@example.test");
    expect(privateProjectViewerUrl("qa-project-1")).not.toContain(id);
  });
});
