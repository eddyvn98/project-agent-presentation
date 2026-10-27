import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ownerKey, savePersonalBrowserGrant, readPersonalBrowserGrant,
  refreshPersonalBrowserState, revokePersonalBrowserGrant,
  updatePersonalBrowserGrant } from "../../lib/project-agent/runtime/browser-agent/personal-vault";

const site = "https://c10.example.test";
const state = { cookies: [{ name: "session", value: "synthetic-secret-c10",
  domain: "c10.example.test", path: "/", expires: -1, httpOnly: true,
  secure: true, sameSite: "Lax" as const }], origins: [] };
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "c10-vault-"));
  vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_DIR", dir);
  vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_MASTER_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_PREVIOUS_KEYS", "");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});
describe("C10 real encrypted Vault rotation and cross-tenant isolation", () => {
  it("independently rotates 8 owner grants and rejects every stale refresh", async () => {
    const owners = Array.from({ length: 8 }, (_, i) => "owner-" + i + "@project-agent.test");
    const first = await Promise.all(owners.map(owner =>
      savePersonalBrowserGrant(owner, site, state, "interact", true)));
    const last = await Promise.all(owners.map((owner, i) =>
      updatePersonalBrowserGrant(owner, site, i % 2 ? "read" : "interact", true)));
    for (let i = 0; i < owners.length; i++) {
      expect(first[i].version).not.toBe(last[i].version);
      expect(await refreshPersonalBrowserState(owners[i], site, first[i].version!, state))
        .toBe(false);
      expect((await readPersonalBrowserGrant(owners[i], site))?.grant.mode)
        .toBe(i % 2 ? "read" : "interact");
    }
    await Promise.all(owners.slice(0, 4).map(owner =>
      revokePersonalBrowserGrant(owner, site)));
    expect((await Promise.all(owners.slice(0, 4).map(owner =>
      readPersonalBrowserGrant(owner, site)))).every(value => value === null)).toBe(true);
    for (const owner of owners.slice(4)) {
      const saved = await readPersonalBrowserGrant(owner, site);
      expect(saved?.grant.automation).toBe(true);
      expect(saved?.state.cookies[0].value).toBe("synthetic-secret-c10");
      const files = await readdir(path.join(dir, ownerKey(owner)));
      for (const file of files.filter(name => name.endsWith(".json"))) {
        const encrypted = await readFile(path.join(dir, ownerKey(owner), file), "utf8");
        expect(encrypted).not.toContain("synthetic-secret-c10");
      }
    }
  });
  it("revocation wins against a stale asynchronous browser refresh", async () => {
    const owner = "one@project-agent.test";
    const saved = await savePersonalBrowserGrant(owner, site, state, "interact", true);
    await revokePersonalBrowserGrant(owner, site);
    const results = await Promise.all(Array.from({ length: 8 }, () =>
      refreshPersonalBrowserState(owner, site, saved.version!, state)));
    expect(results.every(item => item === false)).toBe(true);
    expect(await readPersonalBrowserGrant(owner, site)).toBeNull();
  });
});
