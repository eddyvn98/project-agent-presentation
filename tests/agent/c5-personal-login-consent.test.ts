import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/project-agent/runtime/browser-agent/session", () => ({
  activeBrowserSession: vi.fn(), withBrowserOp: vi.fn(),
  closeBrowserSessionsForOwnerHost: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/personal-vault", () => ({
  vaultHost: vi.fn(), readPersonalBrowserGrant: vi.fn(),
  savePersonalBrowserGrant: vi.fn(), revokePersonalBrowserGrant: vi.fn(),
}));
import { activeBrowserSession, withBrowserOp, closeBrowserSessionsForOwnerHost }
  from "../../lib/project-agent/runtime/browser-agent/session";
import { vaultHost, readPersonalBrowserGrant, savePersonalBrowserGrant,
  revokePersonalBrowserGrant } from "../../lib/project-agent/runtime/browser-agent/personal-vault";
import { beginPersonalLogin, enterPersonalLoginSecret, forgetPersonalLogin,
  isPersonalLoginPreparing, personalLoginStatus, revokePersonalLogin,
  savePersonalLogin, submitPersonalLoginField }
  from "../../lib/project-agent/runtime/browser-agent/personal-auth";

const task = "pat_123456789abc", owner = "owner@project-agent.test";
const secret = "synthetic-password-not-for-logs";
let address = "https://portal.example.test/login";
let field = { tag: "input", type: "password", name: "pass", autocomplete: "current-password" };
const insertText = vi.fn(async (_text: string) => {});
const press = vi.fn(async (_key: string) => {});
const storageState = vi.fn(async () => ({ cookies: [], origins: [] }));
const session = { owner, page: { url: () => address, evaluate: async () => field,
  keyboard: { insertText: (s: string) => insertText(s), press: (s: string) => press(s) } },
  context: { storageState } };
beforeEach(() => {
  vi.resetAllMocks(); forgetPersonalLogin(task);
  address = "https://portal.example.test/login";
  field = { tag: "input", type: "password", name: "pass", autocomplete: "current-password" };
  vi.mocked(activeBrowserSession).mockReturnValue(session as never);
  vi.mocked(withBrowserOp).mockImplementation(((_s: unknown, run: () => Promise<unknown>) => run()) as never);
  vi.mocked(vaultHost).mockImplementation((url: string) => new URL(url).hostname);
  vi.mocked(readPersonalBrowserGrant).mockResolvedValue(null);
  vi.mocked(savePersonalBrowserGrant).mockResolvedValue({ host: "portal.example.test",
    mode: "interact", automation: true, savedAt: "", expiresAt: "" } as never);
});
describe("C5 private login owner and explicit consent", () => {
  it("denies foreign owner at the personal-login boundary even when taskId matches", async () => {
    await expect(beginPersonalLogin(task, "intruder@project-agent.test"))
      .rejects.toThrow(/owner|session/i);
    expect(await personalLoginStatus(task, "intruder@project-agent.test"))
      .toMatchObject({ host: "", grant: null, preparing: false });
    expect(readPersonalBrowserGrant).not.toHaveBeenCalled();
    expect(isPersonalLoginPreparing(task, owner)).toBe(false);
  });
  it("requires matching consent and a focused password/code field without returning secrets", async () => {
    await beginPersonalLogin(task, " OWNER@PROJECT-AGENT.TEST ");
    expect(isPersonalLoginPreparing(task, owner)).toBe(true);
    await expect(enterPersonalLoginSecret(task, "intruder@project-agent.test", secret))
      .rejects.toThrow(/consent/i);
    field = { tag: "input", type: "text", name: "query", autocomplete: "off" };
    await expect(enterPersonalLoginSecret(task, owner, secret))
      .rejects.toThrow(/Focus a password/i);
    expect(insertText).not.toHaveBeenCalled();
    field = { tag: "input", type: "password", name: "pass", autocomplete: "current-password" };
    await expect(enterPersonalLoginSecret(task, owner, "\u0001control"))
      .rejects.toThrow(/consent|valid credential/i);
    const result = await enterPersonalLoginSecret(task, owner, secret);
    expect(result).toEqual({ ok: true });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(insertText).toHaveBeenCalledExactlyOnceWith(secret);
    await submitPersonalLoginField(task, owner);
    expect(press).toHaveBeenCalledExactlyOnceWith("Enter");
  });
  it("refuses to save credentials after navigating away from the consented host", async () => {
    await beginPersonalLogin(task, owner);
    address = "https://different.example.test/login";
    await expect(savePersonalLogin(task, owner, "interact", true))
      .rejects.toThrow(/original website/i);
    expect(savePersonalBrowserGrant).not.toHaveBeenCalled();
    address = "https://portal.example.test/dashboard";
    const result = await savePersonalLogin(task, owner, "interact", true);
    expect(result.grant.host).toBe("portal.example.test");
    expect(storageState).toHaveBeenCalledWith({ indexedDB: true });
    expect(isPersonalLoginPreparing(task, owner)).toBe(false);
    await expect(submitPersonalLoginField(task, owner)).rejects.toThrow(/expired/i);
  });
  it("revoking a website login closes only that owner's authenticated sessions", async () => {
    expect(await revokePersonalLogin(owner, "https://portal.example.test"))
      .toEqual({ ok: true });
    expect(revokePersonalBrowserGrant).toHaveBeenCalledWith(owner, "https://portal.example.test");
    expect(closeBrowserSessionsForOwnerHost)
      .toHaveBeenCalledWith(owner, "portal.example.test");
  });
});
