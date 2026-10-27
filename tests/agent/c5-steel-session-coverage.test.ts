import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("playwright-core", () => ({ chromium: { connectOverCDP: m.connect } }));
import { connectSteelSession, createSteelRemote, releaseSteelRemote }
  from "../../lib/project-agent/runtime/browser-agent/steel-session";
const sid = "steel-safe-session-123";
const base = "http://127.0.0.1:3333";
const browser = () => {
  const close = vi.fn(async () => {});
  const page = { isClosed: () => false };
  const context = { pages: () => [page], newPage: vi.fn(async () => page) };
  return { close, contexts: () => [context] };
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PROJECT_AGENT_STEEL_BROWSER", "1");
  vi.stubEnv("PROJECT_AGENT_STEEL_API_URL", base);
  vi.stubEnv("PROJECT_AGENT_STEEL_API_KEY", "synthetic-secret");
  vi.stubEnv("PROJECT_AGENT_STEEL_CDP_HOST", "");
  vi.stubEnv("PROJECT_AGENT_STEEL_LOCAL_VIEWER", "0");
  vi.stubEnv("PROJECT_AGENT_STEEL_PRIVATE_VIEWER", "0");
  vi.stubEnv("PROJECT_AGENT_STEEL_SESSION_TIMEOUT_MS", "900000");
  vi.stubGlobal("fetch", vi.fn());
  m.connect.mockResolvedValue(browser());
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const reply = (value: object, status = 200) => new Response(JSON.stringify(value),
  { status, headers: { "content-type": "application/json" } });
describe("C5 Steel/CDP authentication, session limits and viewer isolation", () => {
  it("does not create a session if feature is off, endpoint is unsafe or timeout invalid", async () => {
    vi.stubEnv("PROJECT_AGENT_STEEL_BROWSER", "0");
    await expect(createSteelRemote()).rejects.toThrow(/disabled/);
    vi.stubEnv("PROJECT_AGENT_STEEL_BROWSER", "1");
    for (const raw of ["http://example.test", "ftp://example.test",
      "https://u:p@example.test", "http://127.0.0.1:3333?q=secret"]) {
      vi.stubEnv("PROJECT_AGENT_STEEL_API_URL", raw);
      await expect(createSteelRemote()).rejects.toThrow();
    }
    vi.stubEnv("PROJECT_AGENT_STEEL_API_URL", base);
    for (const ms of ["59999", "86400001", "NaN", "0"]) {
      vi.stubEnv("PROJECT_AGENT_STEEL_SESSION_TIMEOUT_MS", ms);
      await expect(createSteelRemote()).rejects.toThrow(/timeout/);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("creates a scoped Steel session with bounded timeout and private server-side key", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply({ id: sid }));
    expect(await createSteelRemote()).toEqual({ id: sid, timeout: 900000 });
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(base + "/v1/sessions");
    expect(options?.headers).toMatchObject({ "steel-api-key": "synthetic-secret" });
    expect(JSON.parse(String(options?.body))).toMatchObject({
      timeout: 900000, debugConfig: { interactive: true },
      dimensions: { width: 1280, height: 800 },
    });
    vi.mocked(fetch).mockResolvedValueOnce(reply({ id: "invalid/id" }));
    await expect(createSteelRemote()).rejects.toThrow(/Invalid Steel session/);
  });
  it("never releases untrusted session identifiers or treats auth failures as success", async () => {
    await expect(releaseSteelRemote("../escape")).rejects.toThrow(/Invalid Steel session/);
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValueOnce(reply({}, 404));
    await expect(releaseSteelRemote(sid)).resolves.toBeUndefined();
    vi.mocked(fetch).mockResolvedValueOnce(reply({}, 403));
    await expect(releaseSteelRemote(sid)).rejects.toThrow(/HTTP 403/);
  });
  it("refuses cross-host plaintext CDP, wrong session identity and missing endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply({ id: "other-steel-session",
      websocketUrl: "ws://127.0.0.1:3333/" }));
    await expect(connectSteelSession(sid)).rejects.toThrow(/identity mismatch/);
    vi.mocked(fetch).mockResolvedValueOnce(reply({ id: sid,
      websocketUrl: "ws://evil.example/session" }));
    await expect(connectSteelSession(sid)).rejects.toThrow(/Plaintext/);
    vi.mocked(fetch).mockResolvedValueOnce(reply({ id: sid,
      websocketUrl: "wss://evil.example/session" }));
    await expect(connectSteelSession(sid)).rejects.toThrow(/Unexpected Steel CDP host/);
    vi.mocked(fetch).mockResolvedValueOnce(reply({ id: sid }));
    await expect(connectSteelSession(sid)).rejects.toThrow(/did not provide/);
    expect(m.connect).not.toHaveBeenCalled();
  });
  it("keeps private viewer unavailable unless explicitly enabled", async () => {
    const viewer = base + "/v1/sessions/" + sid + "/player";
    vi.mocked(fetch).mockResolvedValueOnce(reply({ id: sid,
      websocketUrl: "ws://127.0.0.1:3333/cdp?token=scoped-token", debugUrl: viewer }));
    const connected = await connectSteelSession(sid);
    expect(connected.viewerUrl).toBeNull();
    expect(m.connect.mock.calls[0][0]).toContain("token=scoped-token");
    expect(m.connect.mock.calls[0][0]).not.toContain("apiKey=");
    await connected.disconnect();
    vi.stubEnv("PROJECT_AGENT_STEEL_PRIVATE_VIEWER", "1");
    vi.stubEnv("PROJECT_AGENT_STEEL_VIEWER_PREFIX", "/private/steel");
    vi.mocked(fetch).mockResolvedValueOnce(reply({ id: sid,
      websocketUrl: "wss://127.0.0.1:3333/cdp", debugUrl: viewer }));
    const second = await connectSteelSession(sid);
    expect(second.viewerUrl).toBe("/private/steel/v1/sessions/" + sid + "/player");
    expect(m.connect.mock.calls[1][0]).toContain("apiKey=synthetic-secret");
    await second.disconnect();
  });
  it("closes remote CDP connection if context creation fails", async () => {
    const failed = { close: vi.fn(async () => {}), contexts: () => [] };
    m.connect.mockResolvedValueOnce(failed);
    vi.mocked(fetch).mockResolvedValueOnce(reply({ id: sid,
      websocketUrl: "ws://127.0.0.1:3333/cdp" }));
    await expect(connectSteelSession(sid)).rejects.toThrow(/no default context/);
    expect(failed.close).toHaveBeenCalledOnce();
  });
});
