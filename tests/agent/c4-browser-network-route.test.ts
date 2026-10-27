import { beforeEach, describe, expect, it, vi } from "vitest";
import { installBrowserRouteGuard }
  from "../../lib/project-agent/runtime/browser-agent/session-routing";
import { guardedRequest } from "../../lib/project-agent/runtime/guarded-fetch";
import { assertPublicWebSocketUrl } from "../../lib/project-agent/runtime/browser-agent/safety";
import { checkBrowserSitePolicy } from "../../lib/project-agent/browser-security-policy";

vi.mock("../../lib/project-agent/runtime/guarded-fetch", () => ({ guardedRequest: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/browser-agent/safety", () => ({
  assertPublicWebSocketUrl: vi.fn(),
}));
vi.mock("../../lib/project-agent/browser-security-policy", () => ({
  checkBrowserSitePolicy: vi.fn(),
}));
let httpHandler: (route: any) => Promise<void>;
let wsHandler: (socket: any) => Promise<void>;
const active = { owner: "owner@project-agent.test", authMode: "interact" };
function mockRoute(method = "GET", navigation = false) {
  const request = { url: () => "https://portal.example.test/actions",
    method: () => method, isNavigationRequest: () => navigation,
    allHeaders: async () => ({ host: "evil", "content-length": "999",
      authorization: "synthetic-only" }),
    postDataBuffer: () => method === "POST" ? Buffer.from("safe-payload") : null };
  return { request: () => request, abort: vi.fn(async () => {}),
    fulfill: vi.fn(async () => {}) };
}
beforeEach(async () => {
  vi.resetAllMocks();
  const context = {
    routeWebSocket: vi.fn(async (_pattern: unknown, handler: typeof wsHandler) => { wsHandler = handler; }),
    route: vi.fn(async (_pattern: unknown, handler: typeof httpHandler) => { httpHandler = handler; }),
  };
  await installBrowserRouteGuard(context as never, () => active as never);
  vi.mocked(guardedRequest).mockResolvedValue({
    status: 200, headers: { "content-type": "text/plain" }, body: Buffer.from("ok"),
    truncated: false,
  } as never);
});
describe("C4 Browser Agent real route guard security branches", () => {
  it("enforces owner site policy for navigations and strips unsafe forwarded headers", async () => {
    const route = mockRoute("GET", true);
    await httpHandler(route);
    expect(checkBrowserSitePolicy).toHaveBeenCalledWith(active.owner,
      "https://portal.example.test/actions", "open");
    expect(guardedRequest).toHaveBeenCalledOnce();
    const options = vi.mocked(guardedRequest).mock.calls[0][1]!;
    expect(options.headers).not.toHaveProperty("host");
    expect(options.headers).not.toHaveProperty("content-length");
    expect(route.fulfill).toHaveBeenCalledOnce();
    expect(route.abort).not.toHaveBeenCalled();
  });
  it("denies POST when the owner granted read-only access without sending network traffic", async () => {
    active.authMode = "read";
    const route = mockRoute("POST");
    await httpHandler(route);
    expect(checkBrowserSitePolicy).toHaveBeenCalledWith(active.owner,
      "https://portal.example.test/actions", "submit");
    expect(route.abort).toHaveBeenCalledWith("blockedbyclient");
    expect(guardedRequest).not.toHaveBeenCalled();
    active.authMode = "interact";
  });
  it("fails closed on policy errors, network errors and response truncation", async () => {
    vi.mocked(checkBrowserSitePolicy).mockRejectedValueOnce(new Error("deny"));
    const policy = mockRoute("POST");
    await httpHandler(policy);
    expect(policy.abort).toHaveBeenCalledWith("blockedbyclient");
    expect(guardedRequest).not.toHaveBeenCalled();
    vi.mocked(guardedRequest).mockRejectedValueOnce(new Error("DNS rebinding"));
    const network = mockRoute();
    await httpHandler(network);
    expect(network.abort).toHaveBeenCalledWith("blockedbyclient");
    vi.mocked(guardedRequest).mockResolvedValueOnce({
      status: 200, headers: {}, body: Buffer.from("partial"), truncated: true,
    } as never);
    const truncated = mockRoute();
    await httpHandler(truncated);
    expect(truncated.abort).toHaveBeenCalledWith("failed");
    expect(truncated.fulfill).not.toHaveBeenCalled();
  });
  it("always closes WebSockets until an enforced remote ACL exists", async () => {
    for (const url of ["wss://portal.example.test/events", "ws://127.0.0.1/admin"]) {
      const socket = { url: () => url, close: vi.fn(async () => {}) };
      await wsHandler(socket);
      expect(assertPublicWebSocketUrl).toHaveBeenCalledWith(url);
      expect(socket.close).toHaveBeenCalledOnce();
    }
    vi.mocked(assertPublicWebSocketUrl).mockRejectedValueOnce(new Error("private IP"));
    const socket = { url: () => "ws://localhost", close: vi.fn(async () => {}) };
    await wsHandler(socket);
    expect(socket.close).toHaveBeenCalledOnce();
  });
});
