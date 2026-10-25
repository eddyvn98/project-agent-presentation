import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/browser-agent/index", () => ({
  runBrowserAction: vi.fn(),
}));
import { g2CrashQaAllowed } from "../../lib/project-agent/runtime/browser-agent/g2-crash-qa";

const task = "pat_112233aabbcc", owner = "owner@project-agent.test";
function enabled() {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("G2_QA_CRASH_RECOVERY", "1");
  vi.stubEnv("G2_ISOLATED_QA", "1");
  vi.stubEnv("PROJECT_AGENT_G2_BROWSER_OWNERSHIP", "1");
  vi.stubEnv("PROJECT_AGENT_P8_QA_SESSION", "1");
  vi.stubEnv("PROJECT_AGENT_RUNTIME", "sandbox");
  vi.stubEnv("G2_QA_RUN_ID", "aabbccddeeff");
}
afterEach(() => vi.unstubAllEnvs());
describe("G2 crash endpoint guard cannot be enabled for real users", () => {
  it("allows only explicitly marked test + synthetic owner and task", () => {
    enabled();
    expect(g2CrashQaAllowed(task, owner)).toBe(true);
    expect(g2CrashQaAllowed(task, "real.user@example.com")).toBe(false);
    expect(g2CrashQaAllowed("pat_not_hex", owner)).toBe(false);
  });
  it("rejects production and missing QA flags", () => {
    enabled();
    vi.stubEnv("NODE_ENV", "production");
    expect(g2CrashQaAllowed(task, owner)).toBe(false);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("G2_QA_CRASH_RECOVERY", "0");
    expect(g2CrashQaAllowed(task, owner)).toBe(false);
    vi.stubEnv("G2_QA_CRASH_RECOVERY", "1");
    vi.stubEnv("G2_QA_RUN_ID", "not-valid");
    expect(g2CrashQaAllowed(task, owner)).toBe(false);
  });
});
