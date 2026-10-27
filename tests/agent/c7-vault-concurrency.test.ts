import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { withBrowserOp } from "../../lib/project-agent/runtime/browser-agent/session";
import {
  readPersonalBrowserGrant, refreshPersonalBrowserState, revokePersonalBrowserGrant,
  savePersonalBrowserGrant, updatePersonalBrowserGrant,
} from "../../lib/project-agent/runtime/browser-agent/personal-vault";

const url = "https://c7.example.test", alice = "alice@project-agent.test";
const bob = "bob@project-agent.test";
const state = { cookies: [], origins: [] };
let directory: string;
const synthetic = (owner: string, version: string) => ({
  scopeId: "pat_012345abcdef", owner, authHost: "c7.example.test",
  authVersion: version, operationCount: 0, persistent: false,
  page: { isClosed: () => false }, browser: { isConnected: () => true },
  close: vi.fn(async () => {}),
});
const gate = () => {
  let open!: () => void, entered!: () => void;
  const blocked = new Promise<void>(resolve => { open = resolve; });
  const ready = new Promise<void>(resolve => { entered = resolve; });
  return { blocked, ready, open, entered };
};
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "c7-vault-"));
  vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_DIR", directory);
  vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_MASTER_KEY",
    randomBytes(32).toString("base64"));
  vi.stubEnv("PROJECT_AGENT_SESSION_VAULT_PREVIOUS_KEYS", "");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
describe("C7B/C7E real encrypted Vault and queued Browser Agent operations", () => {
  it("blocks the queued click after consent is revoked while another op holds the lock", async () => {
    const grant = await savePersonalBrowserGrant(alice, url, state, "interact", true);
    const session = synthetic(alice, grant.version!);
    const phase = gate();
    const running = withBrowserOp(session as never,
      async () => { phase.entered(); await phase.blocked; }, false, "system");
    await phase.ready;
    const click = vi.fn(async () => "unsafe click");
    const pending = withBrowserOp(session as never, click, true, "agent",
      session.scopeId, undefined, "click");
    await revokePersonalBrowserGrant(alice, url);
    phase.open(); await running;
    await expect(pending).rejects.toThrow(/revoked or changed/i);
    expect(click).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalledOnce();
    expect(await readPersonalBrowserGrant(alice, url)).toBeNull();
  });
  it("blocks stale interact permission after a consent downgrade", async () => {
    const grant = await savePersonalBrowserGrant(alice, url, state, "interact", true);
    const session = synthetic(alice, grant.version!);
    const phase = gate();
    const running = withBrowserOp(session as never,
      async () => { phase.entered(); await phase.blocked; }, false, "system");
    await phase.ready;
    const mutate = vi.fn(async () => "mutated");
    const pending = withBrowserOp(session as never, mutate, true, "agent",
      session.scopeId, undefined, "click");
    const downgraded = await updatePersonalBrowserGrant(alice, url, "read", true);
    expect(downgraded.version).not.toBe(grant.version);
    phase.open(); await running;
    await expect(pending).rejects.toThrow(/revoked or changed/i);
    expect(mutate).not.toHaveBeenCalled();
    expect((await readPersonalBrowserGrant(alice, url))?.grant.mode).toBe("read");
  });
  it("revocation and stale refresh never cross a second owner's encrypted grant", async () => {
    const a = await savePersonalBrowserGrant(alice, url, state, "interact", true);
    const b = await savePersonalBrowserGrant(bob, url, state, "read", true);
    await revokePersonalBrowserGrant(alice, url);
    expect(await refreshPersonalBrowserState(alice, url, a.version!, state)).toBe(false);
    expect(await readPersonalBrowserGrant(alice, url)).toBeNull();
    const other = await readPersonalBrowserGrant(bob, url);
    expect(other?.grant.version).toBe(b.version);
    expect(other?.grant.mode).toBe("read");
    expect(await refreshPersonalBrowserState(bob, url, b.version!, state)).toBe(true);
  });
});
