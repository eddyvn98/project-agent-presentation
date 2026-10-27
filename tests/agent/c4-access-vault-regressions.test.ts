import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { canAccessProjectAgentTask } from "../../lib/project-agent/access";
import { listPersonalBrowserGrants, readPersonalBrowserGrant,
  refreshPersonalBrowserState, revokePersonalBrowserGrant,
  savePersonalBrowserGrant, updatePersonalBrowserGrant, vaultHost }
  from "../../lib/project-agent/runtime/browser-agent/personal-vault";

const url = "https://portal.example.test";
const owner = "owner@project-agent.test";
const cookie = (domain: string, value: string) => ({
  name: "sid", value, domain, path: "/", expires: -1,
  httpOnly: true, secure: true, sameSite: "Lax" as const,
});
const state = { cookies: [cookie("portal.example.test", "owner-secret"),
  cookie("foreign.example.test", "foreign-secret")],
  origins: [{ origin: url, localStorage: [{ name: "token", value: "safe" }] },
    { origin: "https://foreign.example.test", localStorage: [{ name: "token", value: "unsafe" }] }] };
let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "c4-vault-"));
  vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_DIR", root);
  vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_MASTER_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_PREVIOUS_KEYS", "");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});
describe("C4 owner scope and Vault revocation regressions", () => {
  it("checks task project identity, original owner and canonical project membership", () => {
    const task = { projectId: "proj-a", ownerEmail: " USER@EXAMPLE.TEST ",
      projectOwnerEmail: "CREATOR@EXAMPLE.TEST" };
    expect(canAccessProjectAgentTask(task, "proj-a", " creator@example.test ",
      ["user@example.test"])).toBe(true);
    expect(canAccessProjectAgentTask(task, "proj-b", "creator@example.test",
      ["user@example.test"])).toBe(false);
    expect(canAccessProjectAgentTask(task, "proj-a", "attacker@example.test",
      ["user@example.test"])).toBe(false);
    expect(canAccessProjectAgentTask(task, "proj-a", "creator@example.test",
      ["attacker@example.test"])).toBe(false);
    expect(canAccessProjectAgentTask({ ...task, projectOwnerEmail: "" },
      "proj-a", "creator@example.test", [" USER@example.test "])).toBe(true);
  });
  it("keeps cookies and local storage within approved hosts and isolates owners", async () => {
    await savePersonalBrowserGrant(owner, url, state, "read", false);
    const saved = await readPersonalBrowserGrant(owner, url);
    expect(saved?.state.cookies.map(row => row.value)).toEqual(["owner-secret"]);
    expect(saved?.state.origins.map(row => row.origin)).toEqual([url]);
    expect(await readPersonalBrowserGrant("attacker@project-agent.test", url)).toBeNull();
    expect((await listPersonalBrowserGrants(owner)).map(row => row.host)).toEqual(["portal.example.test"]);
    expect(await listPersonalBrowserGrants("attacker@project-agent.test")).toEqual([]);
  });
  it("rejects IP literals and local addresses as saved login destinations", () => {
    for (const invalid of ["https://127.0.0.1/", "https://192.168.1.5/",
      "https://169.254.169.254/", "https://8.8.8.8/"])
      expect(() => vaultHost(invalid)).toThrow(/HTTPS hostname/);
  });
  it("prevents a stale browser from refreshing after consent changes or revocation", async () => {
    const saved = await savePersonalBrowserGrant(owner, url, state, "interact", true);
    expect(await refreshPersonalBrowserState(owner, url, "stale-version", state)).toBe(false);
    expect(await refreshPersonalBrowserState(owner, url, saved.version!, state)).toBe(true);
    const changed = await updatePersonalBrowserGrant(owner, url, "read", false);
    expect(changed.version).not.toBe(saved.version);
    expect(await refreshPersonalBrowserState(owner, url, saved.version!, state)).toBe(false);
    expect(await refreshPersonalBrowserState(owner, url, changed.version!, state)).toBe(false);
    await revokePersonalBrowserGrant(owner, url);
    expect(await refreshPersonalBrowserState(owner, url, changed.version!, state)).toBe(false);
    expect(await readPersonalBrowserGrant(owner, url)).toBeNull();
  });
  it("rewraps an existing user key using an explicitly listed former master", async () => {
    const previous = process.env.PROJECT_AGENT_SESSION_VAULT_MASTER_KEY!;
    await savePersonalBrowserGrant(owner, url, state, "read", true);
    const current = randomBytes(32).toString("base64");
    vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_MASTER_KEY", current);
    vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_PREVIOUS_KEYS", JSON.stringify([previous]));
    expect((await readPersonalBrowserGrant(owner, url))?.grant.mode).toBe("read");
    vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_PREVIOUS_KEYS", "");
    expect((await readPersonalBrowserGrant(owner, url))?.state.cookies).toHaveLength(1);
  });
});
