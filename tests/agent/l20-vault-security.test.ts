import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ownerKey, savePersonalBrowserGrant, readPersonalBrowserGrant,
  revokePersonalBrowserGrant, revokeAllPersonalBrowserGrants,
  updatePersonalBrowserGrant } from "../../lib/project-agent/runtime/browser-agent/personal-vault";

const locations: string[] = [];
async function isolate() {
  const root = await mkdtemp(path.join(tmpdir(), "pa-l20-vault-"));
  locations.push(root);
  vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_DIR", root);
  vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_MASTER_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_PREVIOUS_KEYS", "");
}
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(locations.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});
const url = "https://portal.example.test";
const credential = "synthetic-session-secret-not-for-logs";
const state = { cookies: [{ name: "session", value: credential, domain: "portal.example.test",
  path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" as const }],
  origins: [] };
describe("L20 encrypted Vault user separation, revocation and file hygiene", () => {
  it("encrypts per-user cookies; one owner cannot decrypt another owner's grant", async () => {
    await isolate();
    const a = "a@project-agent.test", b = "b@project-agent.test";
    const created = await savePersonalBrowserGrant(a, url, state, "interact", true);
    expect(created.version).toBeTruthy();
    expect((await readPersonalBrowserGrant(a, url))?.state.cookies[0].value).toBe(credential);
    expect(await readPersonalBrowserGrant(b, url)).toBe(null);
    const ownerDir = path.join(process.env.PROJECT_AGENT_SESSION_VAULT_DIR!, ownerKey(a));
    const files = await readdir(ownerDir);
    expect(files).toContain("key.json");
    const grants = await Promise.all(files.filter(x => x !== "key.json").map(x =>
      readFile(path.join(ownerDir, x), "utf8")));
    for (const raw of grants) expect(raw).not.toContain(credential);
    expect((await stat(ownerDir)).mode & 0o077).toBe(0);
    await revokePersonalBrowserGrant(a, url);
    expect(await readPersonalBrowserGrant(a, url)).toBe(null);
  });
  it("re-versions grants, prevents old master keys from decrypting and deletes all grants", async () => {
    await isolate();
    const owner = "owner@project-agent.test";
    const first = await savePersonalBrowserGrant(owner, url, state, "read", false);
    const updated = await updatePersonalBrowserGrant(owner, url, "interact", true);
    expect(updated.version).not.toBe(first.version);
    expect((await readPersonalBrowserGrant(owner, url))?.grant.mode).toBe("interact");
    const wrongKey = randomBytes(32).toString("base64");
    vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_MASTER_KEY", wrongKey);
    await expect(readPersonalBrowserGrant(owner, url)).rejects.toThrow();
    vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_PREVIOUS_KEYS", "");
    await revokeAllPersonalBrowserGrants(owner);
    expect(await readPersonalBrowserGrant(owner, url)).toBe(null);
  });
  it("rejects malformed destination and invalid master key", async () => {
    await isolate();
    for (const malicious of ["http://portal.example.test", "https://localhost",
      "https://u:p@portal.example.test", "file:///tmp/secrets"]) {
      await expect(savePersonalBrowserGrant("owner@project-agent.test",
        malicious, state, "read", false)).rejects.toThrow();
    }
    vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_MASTER_KEY", "not-a-key");
    await expect(savePersonalBrowserGrant("owner@project-agent.test",
      url, state, "read", false)).rejects.toThrow();
  });
});
