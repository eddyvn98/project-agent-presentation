import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("playwright-core", () => ({ chromium: { connectOverCDP: m.connect } }));
import { connectSteelSession } from
  "../../lib/project-agent/runtime/browser-agent/steel-session";

const id = "steel-restart-synthetic-123", api = "http://127.0.0.1:3333";
const reply = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status,
    headers: { "content-type": "application/json" } });
function remote() {
  const page = { isClosed: () => false };
  const context = { pages: () => [page], newPage: vi.fn(async () => page) };
  return { context, page, browser: {
    contexts: () => [context], close: vi.fn(async () => {}),
  } };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PROJECT_AGENT_STEEL_API_URL", api);
  vi.stubEnv("PROJECT_AGENT_STEEL_API_KEY", "synthetic-server-key");
  vi.stubEnv("PROJECT_AGENT_STEEL_CDP_HOST", "");
  vi.stubEnv("PROJECT_AGENT_STEEL_LOCAL_VIEWER", "0");
  vi.stubEnv("PROJECT_AGENT_STEEL_PRIVATE_VIEWER", "0");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Steel session reattachment across worker restarts", () => {
  it("refreshes a scoped CDP token to attach a second worker to the same Steel ID", async () => {
    const first = remote(), second = remote();
    vi.mocked(fetch)
      .mockResolvedValueOnce(reply({ id,
        websocketUrl: "ws://127.0.0.1:3333/cdp?token=short-lived-A" }))
      .mockResolvedValueOnce(reply({ id,
        websocketUrl: "ws://127.0.0.1:3333/cdp?token=short-lived-B" }));
    m.connect.mockResolvedValueOnce(first.browser).mockResolvedValueOnce(second.browser);
    const a = await connectSteelSession(id);
    expect(a.id).toBe(id);
    await a.disconnect();
    const b = await connectSteelSession(id);
    expect(b.id).toBe(id);
    expect(a.context).not.toBe(b.context);
    expect(m.connect.mock.calls.map(([url]) => new URL(url).searchParams.get("token")))
      .toEqual(["short-lived-A", "short-lived-B"]);
    expect(first.browser.close).toHaveBeenCalledOnce();
    expect(second.browser.close).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url)))
      .toEqual([api + "/v1/sessions/" + id, api + "/v1/sessions/" + id]);
    await b.disconnect();
  });
  it("does not generate a replacement browser when a transient Steel lookup fails", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("synthetic network reset"))
      .mockResolvedValueOnce(reply({ id,
        websocketUrl: "ws://127.0.0.1:3333/cdp?token=retry-token" }));
    const session = remote();
    m.connect.mockResolvedValueOnce(session.browser);
    await expect(connectSteelSession(id)).rejects.toThrow("synthetic network reset");
    const recovered = await connectSteelSession(id);
    expect(recovered.id).toBe(id);
    expect(m.connect).toHaveBeenCalledOnce();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    await recovered.disconnect();
  });
  it("reconnects to the same ID after CDP transport setup fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(reply({ id,
        websocketUrl: "ws://127.0.0.1:3333/cdp?token=expired" }))
      .mockResolvedValueOnce(reply({ id,
        websocketUrl: "ws://127.0.0.1:3333/cdp?token=renewed" }));
    const session = remote();
    m.connect.mockRejectedValueOnce(new Error("CDP socket closed"))
      .mockResolvedValueOnce(session.browser);
    await expect(connectSteelSession(id)).rejects.toThrow(/CDP socket closed/);
    const recovered = await connectSteelSession(id);
    expect(recovered.id).toBe(id);
    expect(m.connect).toHaveBeenCalledTimes(2);
    expect(m.connect.mock.calls[1][0]).toContain("token=renewed");
    await recovered.disconnect();
  });
  it("refuses a remote session identity mismatch before connecting to CDP", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply({ id: "steel-different-synthetic-123",
      websocketUrl: "ws://127.0.0.1:3333/cdp?token=other-session" }));
    await expect(connectSteelSession(id)).rejects.toThrow(/identity mismatch/);
    expect(m.connect).not.toHaveBeenCalled();
  });
  it("fails closed if Steel returns an unexpected CDP hostname during reattachment", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply({ id,
      websocketUrl: "wss://untrusted.example.test/cdp?token=secrettoken" }));
    await expect(connectSteelSession(id)).rejects.toThrow(/Unexpected Steel CDP host/);
    expect(m.connect).not.toHaveBeenCalled();
  });
});
