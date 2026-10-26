import type { BrowserContext } from "playwright-core";
import type { BrowserSession } from "./session";
import { guardedRequest } from "../guarded-fetch";
import { assertPublicWebSocketUrl } from "./safety";
import { checkBrowserSitePolicy } from "../../browser-security-policy";

/** Existing network restrictions apply to local Chromium and attached Steel CDP. */
export async function installBrowserRouteGuard(
  context: BrowserContext, current: () => BrowserSession | undefined,
): Promise<void> {
  await context.routeWebSocket(/.*/, async socket => {
    try { await assertPublicWebSocketUrl(socket.url()); }
    catch { /* Block unsafe destinations; do not log full URLs. */ }
    // The remote browser host has no enforced websocket network ACL yet.
    // Fail closed rather than permitting an SSRF bypass via WebSocket.
    await socket.close();
  });
  await context.route("**/*", async route => {
    try {
      const req = route.request();
      const active = current();
      const method = req.method().toUpperCase();
      const navigation = req.isNavigationRequest();
      if (active?.owner && (navigation || !["GET","HEAD","OPTIONS"].includes(method)))
        await checkBrowserSitePolicy(active.owner, req.url(),
          navigation ? "open" : "submit");
      if (active?.authMode === "read" && !["GET","HEAD","OPTIONS"].includes(method)) {
        await route.abort("blockedbyclient").catch(() => {});
        return;
      }
      const { host: _host, "content-length": _size, ...headers } = await req.allHeaders();
      const response = await guardedRequest(req.url(), {
        method: req.method(), headers, body: req.postDataBuffer() ?? undefined,
        timeoutMs: 35_000, maxBytes: 25 * 1024 * 1024,
      });
      if (response.truncated) {
        await route.abort("failed").catch(() => {});
        return;
      }
      await route.fulfill({ status: response.status, headers: response.headers, body: response.body });
    } catch {
      await route.abort("blockedbyclient").catch(() => {});
    }
  });
}
