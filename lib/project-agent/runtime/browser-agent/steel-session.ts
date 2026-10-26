import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

/** Explicit Steel integration. Browser and debug URLs must never be logged. */
export interface SteelConnection {
  browser: Browser; context: BrowserContext; page: Page;
  viewerUrl: string | null; release(): Promise<void>;
}
function apiBase(): URL {
  const raw = process.env.PROJECT_AGENT_STEEL_API_URL?.trim();
  if (!raw) throw new Error("Set PROJECT_AGENT_STEEL_API_URL before opening a shared browser");
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash || !["http:", "https:"].includes(url.protocol))
    throw new Error("Invalid Steel API URL");
  if (url.protocol === "http:" && !["127.0.0.1", "localhost", "::1"].includes(url.hostname))
    throw new Error("Steel API must use HTTPS outside loopback");
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "") + "/v1/";
  return url;
}
function headers(): Record<string, string> {
  return { "Content-Type": "application/json",
    ...(process.env.PROJECT_AGENT_STEEL_API_KEY ? { "steel-api-key": process.env.PROJECT_AGENT_STEEL_API_KEY } : {}) };
}
async function releaseSteel(base: URL, id: string): Promise<void> {
  await fetch(new URL("sessions/" + encodeURIComponent(id) + "/release", base), {
    method: "POST", headers: headers(), signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  }).catch(() => undefined);
}
function trustedViewer(raw: string | undefined, sessionId: string): string | null {
  if (!raw || process.env.PROJECT_AGENT_STEEL_TRUSTED_VIEWER !== "1") return null;
  try {
    const source = new URL(raw);
    const proxy = new URL(process.env.PROJECT_AGENT_STEEL_VIEWER_ORIGIN || "");
    if (source.origin !== apiBase().origin) return null;
    if (!source.pathname.endsWith("/sessions/" + sessionId + "/player")) return null;
    if (proxy.username || proxy.password || proxy.search || proxy.hash || proxy.pathname !== "/") return null;
    if (proxy.protocol !== "https:" && !(proxy.protocol === "http:" &&
      ["127.0.0.1", "localhost", "::1"].includes(proxy.hostname))) return null;
    return new URL(source.pathname + source.search, proxy).toString();
  } catch { return null; }
}
/** The caller installs the existing guarded-fetch/policy interception on the returned context. */
export async function connectSteelSession(): Promise<SteelConnection> {
  if (process.env.PROJECT_AGENT_STEEL_BROWSER !== "1")
    throw new Error("Project browser requires PROJECT_AGENT_STEEL_BROWSER=1");
  const base = apiBase();
  const response = await fetch(new URL("sessions", base), {
    method: "POST", headers: headers(), cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ dimensions: { width: 1280, height: 800 },
      timeout: 60 * 60_000, inactivityTimeout: 30 * 60_000,
      debugConfig: { interactive: true } }),
  });
  if (!response.ok) throw new Error("Steel session creation failed (HTTP " + response.status + ")");
  const session = await response.json() as {
    id?: string; websocketUrl?: string; debugUrl?: string; sessionViewerUrl?: string;
  };
  if (!session.id || !/^[a-zA-Z0-9-]{8,80}$/.test(session.id))
    throw new Error("Steel returned an invalid session id");
  let browser: Browser | undefined;
  try {
    if (!session.websocketUrl) throw new Error("Steel did not provide a CDP websocket URL");
    const cdp = new URL(session.websocketUrl);
    if (!["ws:", "wss:"].includes(cdp.protocol)) throw new Error("Invalid Steel CDP URL");
    if (cdp.protocol === "ws:" && !["localhost", "127.0.0.1", "::1"].includes(cdp.hostname))
      throw new Error("Steel CDP requires TLS outside loopback");
    if (process.env.PROJECT_AGENT_STEEL_API_KEY && !cdp.searchParams.has("apiKey"))
      cdp.searchParams.set("apiKey", process.env.PROJECT_AGENT_STEEL_API_KEY);
    browser = await chromium.connectOverCDP(cdp.toString(), { timeout: 20_000 });
    const context = browser.contexts()[0];
    if (!context) throw new Error("Steel did not expose an existing browser context");
    const page = context.pages()[0] ?? await context.newPage();
    const connected = browser;
    let released = false;
    return { browser: connected, context, page,
      viewerUrl: trustedViewer(session.debugUrl, session.id),
      release: async () => {
        if (released) return;
        released = true;
        await connected.close().catch(() => undefined);
        await releaseSteel(base, session.id!);
      },
    };
  } catch (error) {
    await browser?.close().catch(() => undefined);
    await releaseSteel(base, session.id);
    throw error;
  }
}
