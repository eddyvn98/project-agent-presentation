import { afterEach, expect, it, vi } from "vitest";
const { access } = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock("@/lib/capabilities/project-sharing", () => ({
  getProjectAccess: (...args: unknown[]) => access(...args),
}));
import { runXerjAction } from "../../lib/project-agent/xerj/runtime-action";
import { xerjPrefix } from "../../lib/project-agent/xerj/client";

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("does not search XERJ when current Project membership is revoked", async () => {
  access.mockResolvedValue(null);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const outcome = await runXerjAction({
    chatId: "c1", projectId: "p1", ownerEmail: "a@example.test", query: "locate helper", user: "test",
  }, { action: "xerj_search", query: "helper" });
  expect(outcome.failed).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
});
it("emits a real search tool event and returns only this Project's indexed result", async () => {
  access.mockResolvedValue({ role: "OWNER" });
  vi.stubEnv("PROJECT_AGENT_XERJ_ENABLED", "1");
  vi.stubEnv("PROJECT_AGENT_XERJ_URL", "http://127.0.0.1:9200");
  vi.stubEnv("PROJECT_AGENT_XERJ_INDEX_SALT", "a-stable-secret-for-this-test");
  vi.stubEnv("PROJECT_AGENT_XERJ_API_KEY", "test-key");
  const events: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ hits: { hits: [{
    _index: xerjPrefix("p1") + "-code", _id: "fn1", _source: { path: "src/index.ts", code: "export const answer = 42" },
  }] } }))));
  const outcome = await runXerjAction({
    chatId: "c1", projectId: "p1", ownerEmail: "a@example.test", query: "locate helper", user: "test",
    onStep: (value) => events.push(value.tool),
  }, { action: "xerj_search", query: "answer" });
  expect(outcome.failed).toBeUndefined();
  expect(outcome.text).toContain("src/index.ts");
  expect(events).toEqual(["xerj_search"]);
});
