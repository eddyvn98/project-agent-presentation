import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), loop: vi.fn(), probe: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/browser-agent/session", () => ({
  activeBrowserSession: mocks.session,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/loop-state", () => ({
  browserLoopStatus: mocks.loop,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/p8-qa-fixture", () => ({
  p8QaBrowserProbe: mocks.probe,
}));
import { checkG1SyntheticGoal, formatG1Receipt, g1QaPrompt, isG1QaIdentity,
  isG1QaTask } from "../../lib/project-agent/runtime/g1-goal-check";
import type { RuntimeInput } from "../../lib/project-agent/runtime/run-agent-types";

const taskId = "pat_fedcba987654", owner = "g1-owner@project-agent.test";
const input = { taskId, chatId: taskId, ownerEmail: owner, user: owner,
  userPrompt: g1QaPrompt("success"), query: g1QaPrompt("success") } as RuntimeInput;
function session(value: string, marker = 1) {
  return { owner, browser: { isConnected: () => true },
    page: { isClosed: () => false, url: () => "about:blank",
      locator: (selector: string) => ({
        count: async () => selector.includes("data-p7-synthetic") ? marker : 0,
        textContent: async () => value,
      }),
    },
  };
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PROJECT_AGENT_G1_QA", "1");
  vi.stubEnv("PROJECT_AGENT_P8_QA_SESSION", "1");
  vi.stubEnv("PROJECT_AGENT_P8_LOOP", "1");
  mocks.session.mockReturnValue(session("1"));
  mocks.loop.mockReturnValue({ verified: 1, actions: 1 });
  mocks.probe.mockReturnValue({ connected: true, networkAttempts: 0 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("G1 synthetic goal is checked outside the model", () => {
  it("requires explicit dev flags, synthetic owner and exact marker", () => {
    expect(isG1QaIdentity(input)).toBe(true);
    expect(isG1QaTask({ id: taskId, ownerEmail: owner, prompt: input.userPrompt!,
      userPrompt: input.userPrompt })).toBe(true);
    expect(isG1QaIdentity({ ...input, ownerEmail: "employee@company.test" })).toBe(false);
    expect(isG1QaIdentity({ ...input, userPrompt: "Counter target=1" })).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(isG1QaIdentity(input)).toBe(false);
  });
  it("returns a bounded receipt only from actual synthetic DOM and P8 evidence", async () => {
    const receipt = await checkG1SyntheticGoal(input);
    expect(receipt).toMatchObject({ taskId, observed: 1, expected: 1,
      checker: "chromium_dom", p8Verified: 1, pageNetworkAttempts: 0 });
    expect(formatG1Receipt(receipt!)).toContain("G1_VERIFIED_RECEIPT");
  });
  it.each(["0", "2", "success", ""])( "rejects model claims with DOM still %s", async value => {
    mocks.session.mockReturnValue(session(value));
    await expect(checkG1SyntheticGoal(input)).rejects.toThrow(/not independently verified/);
  });
  it("rejects missing browser/P8 verification, or a network request", async () => {
    mocks.loop.mockReturnValue({ verified: 0, actions: 1 });
    await expect(checkG1SyntheticGoal(input)).rejects.toThrow(/not independently verified/);
    mocks.loop.mockReturnValue({ verified: 1, actions: 1 });
    mocks.probe.mockReturnValue({ connected: true, networkAttempts: 1 });
    await expect(checkG1SyntheticGoal(input)).rejects.toThrow(/not independently verified/);
    mocks.probe.mockReturnValue({ connected: true, networkAttempts: 0 });
    mocks.session.mockReturnValue(session("1", 0));
    await expect(checkG1SyntheticGoal(input)).rejects.toThrow(/not independently verified/);
  });
});
