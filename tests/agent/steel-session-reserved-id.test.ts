import { afterEach, describe, expect, it, vi } from "vitest";
import { createSteelRemote } from "../../lib/project-agent/runtime/browser-agent/steel-session";

const uuid = "123e4567-e89b-42d3-a456-426614174000";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function setupFetch(id: string) {
  vi.stubEnv("PROJECT_AGENT_STEEL_BROWSER", "1");
  vi.stubEnv("PROJECT_AGENT_STEEL_API_URL", "http://127.0.0.1:3000");
  const fetchMock = vi.fn(async () => ({
    ok: true, status: 200, json: async () => ({ id }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
describe("Steel create-session reserved UUID contract", () => {
  it("sends a pre-reserved UUID in the real REST creation payload", async () => {
    const fetchMock = setupFetch(uuid);
    const result = await createSteelRemote(uuid);
    expect(result.id).toBe(uuid);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/v1/sessions");
    expect(request.method).toBe("POST");
    const body = JSON.parse(request.body as string);
    expect(body).toMatchObject({ sessionId: uuid, timeout: 900000 });
  });
  it("keeps the ordinary non-reserved REST request unchanged by default", async () => {
    const fetchMock = setupFetch(uuid);
    await createSteelRemote();
    const [, request] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(JSON.parse(request.body as string)).not.toHaveProperty("sessionId");
  });
  it("refuses invalid reserved values before contacting Steel", async () => {
    const fetchMock = setupFetch(uuid);
    await expect(createSteelRemote("not-a-uuid")).rejects.toThrow(/Invalid reserved/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
