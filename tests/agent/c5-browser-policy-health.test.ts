import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/project-agent/browser-security-policy", () => ({
  checkBrowserSitePolicy: vi.fn(), recordBrowserSecurityAudit: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/personal-vault", () => ({
  refreshPersonalBrowserState: vi.fn(),
}));
import { checkBrowserSitePolicy, recordBrowserSecurityAudit }
  from "../../lib/project-agent/browser-security-policy";
import { refreshPersonalBrowserState }
  from "../../lib/project-agent/runtime/browser-agent/personal-vault";
import { checkAgentBrowserPolicy }
  from "../../lib/project-agent/runtime/browser-agent/policy-hook";
import { checkSavedBrowserHealth }
  from "../../lib/project-agent/runtime/browser-agent/browser-session-health";

const owner = "owner@project-agent.test";
let address = "https://portal.example.test/dashboard", passwordVisible = false;
const isVisible = vi.fn(async () => passwordVisible);
const storageState = vi.fn(async () => ({ cookies: [], origins: [] }));
const session = { owner, authHost: "portal.example.test", authVersion: "consent-v1",
  authMode: "read", lastAuthSavedAt: 0,
  page: { url: () => address, locator: () => ({ first: () => ({ isVisible }) }) },
  context: { storageState } };
const input = { ownerEmail: owner, projectId: "proj-c5", taskId: "pat_123456789abc" };
beforeEach(() => {
  vi.resetAllMocks(); address = "https://portal.example.test/dashboard";
  passwordVisible = false; session.lastAuthSavedAt = 0;
  vi.mocked(refreshPersonalBrowserState).mockResolvedValue(true);
});
describe("C5 Browser Agent fail-closed policy and saved-session health", () => {
  it("bypasses only blank pages and requests with no authenticated owner", async () => {
    await checkAgentBrowserPolicy({ ...input, ownerEmail: "" } as never,
      session as never, "click");
    await checkAgentBrowserPolicy(input as never, {
      ...session, page: { url: () => "about:blank" },
    } as never, "click");
    expect(checkBrowserSitePolicy).not.toHaveBeenCalled();
    expect(recordBrowserSecurityAudit).not.toHaveBeenCalled();
  });
  it("audits allowed and denied browser operations with project and task identity", async () => {
    await checkAgentBrowserPolicy(input as never, session as never, "click");
    expect(recordBrowserSecurityAudit).toHaveBeenCalledWith(expect.objectContaining({
      owner, projectId: input.projectId, taskId: input.taskId,
      hostname: "portal.example.test", action: "click", decision: "allow",
    }));
    vi.mocked(checkBrowserSitePolicy).mockRejectedValueOnce(new Error("read-only policy"));
    await expect(checkAgentBrowserPolicy(input as never, session as never, "submit"))
      .rejects.toThrow(/read-only/);
    expect(recordBrowserSecurityAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({ decision: "deny", action: "submit" }));
    await expect(checkAgentBrowserPolicy(input as never, session as never,
      "open", "not-a-url")).rejects.toThrow(/invalid/);
  });
  it("treats password prompts on login URLs as reauthentication, not a CAPTCHA bypass", async () => {
    address = "https://portal.example.test/sign-in";
    passwordVisible = true;
    expect(await checkSavedBrowserHealth(session as never))
      .toMatch(/reauthentication/i);
    expect(refreshPersonalBrowserState).not.toHaveBeenCalled();
  });
  it("does not refresh grants on foreign origins, visible password prompts or fresh sessions", async () => {
    address = "https://foreign.example.test/dashboard";
    expect(await checkSavedBrowserHealth(session as never)).toBeNull();
    address = "https://portal.example.test/dashboard"; passwordVisible = true;
    expect(await checkSavedBrowserHealth(session as never)).toBeNull();
    passwordVisible = false; session.lastAuthSavedAt = Date.now();
    expect(await checkSavedBrowserHealth(session as never)).toBeNull();
    expect(refreshPersonalBrowserState).not.toHaveBeenCalled();
  });
  it("refreshes only the owner's versioned grant, swallowing optional storage failures", async () => {
    await checkSavedBrowserHealth(session as never);
    expect(storageState).toHaveBeenCalledWith({ indexedDB: true });
    expect(refreshPersonalBrowserState).toHaveBeenCalledWith(
      owner, "https://portal.example.test", "consent-v1",
      { cookies: [], origins: [] });
    vi.mocked(refreshPersonalBrowserState).mockRejectedValueOnce(new Error("Vault offline"));
    session.lastAuthSavedAt = 0;
    await expect(checkSavedBrowserHealth(session as never)).resolves.toBeNull();
  });
});
