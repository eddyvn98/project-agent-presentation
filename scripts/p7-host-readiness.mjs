/** Anonymous, read-only check: no cookies, user data or secrets are sent. */
export async function inspectP7Host(base, request = fetch, chatPath = "/assistant") {
  const target = new URL(base);
  if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("HTTP(S) origin required");
  if (target.pathname !== "/" || target.search || target.hash || target.username || target.password)
    throw new Error("Expected bare host origin, without credentials or path");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) &&
      process.env.P7_ALLOW_REMOTE_HOST !== "1") throw new Error("Remote probe requires P7_ALLOW_REMOTE_HOST=1");
  if (!chatPath.startsWith("/") || chatPath.startsWith("//") || chatPath.includes("://"))
    throw new Error("Invalid host chat path");
  const checks = [];
  for (const [label, pathname] of [["auth_providers", "/api/auth/providers"], ["chat_route", chatPath]]) {
    let response;
    try {
      response = await request(new URL(pathname, target.origin), {
        method: "GET", redirect: "manual", signal: AbortSignal.timeout(5000),
        headers: { Accept: label === "auth_providers" ? "application/json" : "text/html" },
      });
    } catch (error) {
      return { ready: false, checks, blocker: "HOST_UNREACHABLE",
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
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const base = process.env.P7_HOST_BASE_URL;
  if (!base) throw new Error("P7_HOST_BASE_URL required");
  const result = await inspectP7Host(base, fetch, process.env.P7_PROJECT_CHAT_PATH || "/assistant");
  console.log(JSON.stringify(result, null, 2)); // No response body, cookies or secrets.
  if (!result.ready) process.exitCode = 1;
}
