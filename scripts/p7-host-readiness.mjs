import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
/** Anonymous, read-only check: no cookies, user data or secrets are sent. */
export async function inspectP7Host(base, request = fetch, chatPath = "/assistant", timeoutMs = 15_000) {
  const target = new URL(base);
  if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("HTTP(S) origin required");
  if (target.pathname !== "/" || target.search || target.hash || target.username || target.password)
    throw new Error("Expected bare host origin, without credentials or path");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) &&
      process.env.P7_ALLOW_REMOTE_HOST !== "1") throw new Error("Remote probe requires P7_ALLOW_REMOTE_HOST=1");
  if (!chatPath.startsWith("/") || chatPath.startsWith("//") || chatPath.includes("://"))
    throw new Error("Invalid host chat path");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000)
    throw new Error("P7 readiness timeout must be between 1000 and 60000 ms");
  const checks = [];
  for (const [label, pathname] of [["auth_providers", "/api/auth/providers"], ["chat_route", chatPath]]) {
    let response;
    try {
      response = await request(new URL(pathname, target.origin), {
        method: "GET", redirect: "manual", signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: label === "auth_providers" ? "application/json" : "text/html" },
      });
    } catch (error) {
      const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
      const blocker = label === "chat_route" ?
        (timedOut ? "CHAT_ROUTE_TIMEOUT" : "CHAT_ROUTE_NETWORK_ERROR") : "HOST_UNREACHABLE";
      return { ready: false, checks: [...checks, { name: label, status: null }], blocker,
        detail: error instanceof Error ? error.name : "Connection failed" };
    }
    checks.push({ name: label, status: response.status });
    if (response.status >= 500) return { ready: false, checks, blocker: "HOST_SERVER_ERROR" };
    if (label === "auth_providers") {
      if (response.status !== 200) return { ready: false, checks, blocker: "AUTH_PROVIDERS_UNAVAILABLE" };
      const body = await response.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body))
        return { ready: false, checks, blocker: "AUTH_PROVIDERS_INVALID" };
    } else if (![200, 302, 303, 307, 308, 401, 403].includes(response.status)) {
      return { ready: false, checks, blocker: "CHAT_ROUTE_UNAVAILABLE" };
    }
  }
  return { ready: true, checks };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const base = process.env.P7_HOST_BASE_URL;
  if (!base) throw new Error("P7_HOST_BASE_URL required");
  const result = await inspectP7Host(base, fetch, process.env.P7_PROJECT_CHAT_PATH || "/assistant",
    Number(process.env.P7_READINESS_TIMEOUT_MS ?? 15000));
  console.log(JSON.stringify(result, null, 2)); // No response body, cookies or secrets.
  if (!result.ready) process.exitCode = 1;
}
