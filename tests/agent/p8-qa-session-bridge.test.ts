import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserSession } from "../../lib/project-agent/runtime/browser-agent/session";
import { registerP8QaBrowserSession, activeBrowserSession, closeBrowserSession }
  from "../../lib/project-agent/runtime/browser-agent/session";

const taskId = "pat_f1e2d3c4b5a6", another = "pat_111122223333";
function fake() {
  let connected = true, closed = false;
  const close = vi.fn(async () => { connected = false; closed = true; });
  return { session: { page: { isClosed: () => closed },
    browser: { isConnected: () => connected }, close } as unknown as BrowserSession, close };
}
afterEach(async () => {
  await closeBrowserSession(taskId); await closeBrowserSession(another);
  vi.unstubAllEnvs();
});
describe("P8 QA process-local browser bridge", () => {
  it("preserves active Chromium identity across repeated lookups", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PROJECT_AGENT_P8_QA_SESSION", "1");
    const fixture = fake();
    registerP8QaBrowserSession(taskId, fixture.session);
    expect(activeBrowserSession(taskId)).toBe(fixture.session);
    expect(activeBrowserSession(taskId)).toBe(fixture.session);
    await closeBrowserSession(taskId);
    expect(fixture.close).toHaveBeenCalledOnce();
    expect(activeBrowserSession(taskId)).toBeNull();
  });
  it("never registers a QA fixture in production or when disabled", () => {
    const session = fake().session;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PROJECT_AGENT_P8_QA_SESSION", "1");
    expect(() => registerP8QaBrowserSession(taskId, session)).toThrow(/disabled/);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PROJECT_AGENT_P8_QA_SESSION", "0");
    expect(() => registerP8QaBrowserSession(taskId, session)).toThrow(/disabled/);
  });
  it("limits live QA fixtures to a single synthetic task per process", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PROJECT_AGENT_P8_QA_SESSION", "1");
    registerP8QaBrowserSession(taskId, fake().session);
    expect(() => registerP8QaBrowserSession(another, fake().session))
      .toThrow(/Only one isolated/);
  });
});
