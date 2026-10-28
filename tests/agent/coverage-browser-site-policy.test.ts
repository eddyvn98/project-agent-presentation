import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ check: vi.fn(), audit: vi.fn() }));
vi.mock("../../lib/project-agent/browser-security-policy", () => ({
  checkBrowserSitePolicy: m.check, recordBrowserSecurityAudit: m.audit,
}));
import { checkAgentBrowserPolicy } from
  "../../lib/project-agent/runtime/browser-agent/policy-hook";
const input = {
  chatId: "synthetic-chat", taskId: "pat_123456789abc",
  projectId: "project-qa", ownerEmail: "owner@example.test",
};
const session = { page: { url: () => "https://portal.example.test/private" } };
beforeEach(() => {
  vi.clearAllMocks();
  m.check.mockResolvedValue(undefined);
  m.audit.mockResolvedValue(undefined);
});
describe("Browser site policy validates owner-specific destination before actions", () => {
  it("does not contact the policy provider for a blank page", async () => {
    await expect(checkAgentBrowserPolicy(input as never, {
      page: { url: () => "about:blank" },
    } as never, "snapshot")).resolves.toBeUndefined();
    expect(m.check).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
  it("keeps the no-owner legacy path without inventing a consent owner", async () => {
    await checkAgentBrowserPolicy({ ...input, ownerEmail: undefined } as never,
      session as never, "snapshot");
    expect(m.check).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
  it("checks explicit destinations and audits the correct owner, task and domain", async () => {
    await checkAgentBrowserPolicy(input as never, session as never,
      "navigate", "https://public.example.test/docs?q=1");
    expect(m.check).toHaveBeenCalledWith(
      input.ownerEmail, "https://public.example.test/docs?q=1", "navigate");
    expect(m.audit).toHaveBeenCalledWith({
      owner: input.ownerEmail, projectId: input.projectId,
      taskId: input.taskId, hostname: "public.example.test",
      action: "navigate", decision: "allow",
    });
  });
  it("rejects a malformed destination before policy or security audit", async () => {
    await expect(checkAgentBrowserPolicy(input as never, session as never,
      "navigate", "not a URL")).rejects.toThrow(/destination is invalid/);
    expect(m.check).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
  it("records an explicit denial when a site's permission has been revoked", async () => {
    m.check.mockRejectedValueOnce(new Error("synthetic consent revoked"));
    await expect(checkAgentBrowserPolicy(input as never, session as never,
      "click")).rejects.toThrow(/consent revoked/);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({
      hostname: "portal.example.test", action: "click", decision: "deny",
    }));
    expect(m.audit).not.toHaveBeenCalledWith(expect.objectContaining({
      decision: "allow",
    }));
  });
  it("does not permit later actions just because an earlier check passed", async () => {
    await checkAgentBrowserPolicy(input as never, session as never, "snapshot");
    m.check.mockRejectedValueOnce(new Error("site permission removed"));
    await expect(checkAgentBrowserPolicy(input as never, session as never,
      "type")).rejects.toThrow(/permission removed/);
    expect(m.check).toHaveBeenCalledTimes(2);
    expect(m.audit.mock.calls.map(([row]) => row.decision))
      .toEqual(["allow", "deny"]);
  });
  it("fails visibly rather than hiding an audit database outage", async () => {
    m.audit.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(checkAgentBrowserPolicy(input as never, session as never,
      "navigate")).rejects.toThrow("audit unavailable");
    expect(m.check).toHaveBeenCalledOnce();
  });
});
