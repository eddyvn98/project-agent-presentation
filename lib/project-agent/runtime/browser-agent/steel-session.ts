import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

export interface SteelDescriptor { id: string; timeout: number; }
export interface SteelConnection {
  id: string; browser: Browser; context: BrowserContext; page: Page;
  viewerUrl: string | null; disconnect(): Promise<void>;
}
function apiBase(): URL {
  const raw = process.env.PROJECT_AGENT_STEEL_API_URL?.trim();
  if (!raw) throw new Error("PROJECT_AGENT_STEEL_API_URL is required");
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash ||
      !["http:", "https:"].includes(url.protocol)) throw new Error("Invalid Steel API URL");
  if (url.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname))
    throw new Error("Steel HTTP API is allowed only on loopback");
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "") + "/v1/";
  return url;
}
function headers() {
  return { "Content-Type": "application/json",
    ...(process.env.PROJECT_AGENT_STEEL_API_KEY ?
      { "steel-api-key": process.env.PROJECT_AGENT_STEEL_API_KEY } : {}) };
}
function assertSessionId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(value))
    throw new Error("Invalid Steel session identifier");
  return value;
}
function sessionTimeout(): number {
  const raw = Number(process.env.PROJECT_AGENT_STEEL_SESSION_TIMEOUT_MS ?? 900_000);
  if (!Number.isSafeInteger(raw) || raw < 60_000 || raw > 86_400_000)
    throw new Error("Invalid Steel session timeout");
  return raw;
}
export async function createSteelRemote(reservedId?: string): Promise<SteelDescriptor> {
  if (process.env.PROJECT_AGENT_STEEL_BROWSER !== "1")
    throw new Error("Shared Steel browser is disabled");
  const timeout = sessionTimeout();
  if (reservedId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(reservedId))
    throw new Error("Invalid reserved Steel session UUID");
  const response = await fetch(new URL("sessions", apiBase()), {
    method: "POST", cache: "no-store", headers: headers(),
    signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({ ...(reservedId ? { sessionId: reservedId } : {}),
      timeout, inactivityTimeout: Math.min(30 * 60_000, timeout - 1000),
      dimensions: { width: 1280, height: 800 },
      headless: false, debugConfig: { interactive:
        process.env.PROJECT_AGENT_STEEL_PRIVATE_VIEWER !== "1" } }),
  });
  if (!response.ok) throw new Error("Steel create failed: HTTP " + response.status);
  const body = await response.json() as { id?: string };
  return { id: assertSessionId(body.id), timeout };
}
export async function releaseSteelRemote(id: string): Promise<void> {
  const response = await fetch(new URL("sessions/" + assertSessionId(id) + "/release", apiBase()), {
    method: "POST", cache: "no-store", headers: headers(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok && response.status !== 404 && response.status !== 410)
    throw new Error("Steel release failed: HTTP " + response.status);
}
function allowedCdpEndpoint(raw: string): URL {
  const url = new URL(raw);
  if (url.username || url.password || !["ws:", "wss:"].includes(url.protocol))
    throw new Error("Invalid Steel CDP endpoint");
  if (url.protocol === "ws:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname))
    throw new Error("Plaintext Steel CDP endpoint denied");
  const base = apiBase();
  const trusted = process.env.PROJECT_AGENT_STEEL_CDP_HOST?.trim();
  const cloud = "connect.steel.dev";
  if (url.hostname !== base.hostname && url.hostname !== cloud && url.hostname !== trusted)
    throw new Error("Unexpected Steel CDP host");
  return url;
}
function securedViewer(steelId: string, raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = new URL(raw);
    if (parsed.origin !== apiBase().origin ||
        !parsed.pathname.endsWith("/sessions/" + steelId + "/player")) return null;
    const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    if (process.env.NODE_ENV !== "production" && local &&
        process.env.PROJECT_AGENT_STEEL_LOCAL_VIEWER === "1")
      return parsed.toString(); // Explicit private development-only opt-in.
    if (process.env.PROJECT_AGENT_STEEL_PRIVATE_VIEWER !== "1") return null;
    const prefix = process.env.PROJECT_AGENT_STEEL_VIEWER_PREFIX?.trim();
    // Only the project-scoped, auth_request-backed path is allowed for production.
    if (prefix !== "/private-steel-viewer" ||
        (process.env.PROJECT_AGENT_STEEL_VIEWER_GATEWAY_SECRET?.length ?? 0) < 32)
      return null;
    // Production requires a separately deployed auth-enforcing WebRTC reverse proxy.
    return (prefix.endsWith("/") ? prefix.slice(0, -1) : prefix) + "/v1/sessions/" +
      encodeURIComponent(steelId) + "/player";
  } catch { return null; }
}
/** GET refreshes the short-lived scoped CDP token when attaching from another worker. */
export async function connectSteelSession(id: string): Promise<SteelConnection> {
  const steelId = assertSessionId(id);
  const response = await fetch(new URL("sessions/" + steelId, apiBase()), {
    headers: headers(), cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Steel session unavailable: HTTP " + response.status);
  const data = await response.json() as { id?: string; websocketUrl?: string; debugUrl?: string };
  if (assertSessionId(data.id) !== steelId) throw new Error("Steel session identity mismatch");
  const supplied = data.websocketUrl || (apiBase().hostname === "api.steel.dev" ?
    "wss://connect.steel.dev?sessionId=" + encodeURIComponent(steelId) : "");
  if (!supplied) throw new Error("Steel did not provide a CDP endpoint for this deployment");
  const cdp = allowedCdpEndpoint(supplied);
  // Steel Cloud can return a session-scoped CDP token. Preserve that token;
  // only use the server-side API key if the endpoint has neither credential.
  if (!cdp.searchParams.has("token") && !cdp.searchParams.has("apiKey") &&
      process.env.PROJECT_AGENT_STEEL_API_KEY)
    cdp.searchParams.set("apiKey", process.env.PROJECT_AGENT_STEEL_API_KEY);
  if (!cdp.searchParams.has("sessionId") && cdp.hostname === "connect.steel.dev")
    cdp.searchParams.set("sessionId", steelId);
  const browser = await chromium.connectOverCDP(cdp.toString(), { timeout: 20_000 });
  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error("Steel remote browser has no default context");
    const page = context.pages()[0] ?? await context.newPage();
    return { id: steelId, browser, context, page,
      viewerUrl: securedViewer(steelId, data.debugUrl),
      disconnect: async () => { await browser.close().catch(() => {}); },
    };
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}
