import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { BrowserContext } from "playwright-core";
import { masterVaultKey, seal, unseal, type SealedPayload } from "./personal-vault-crypto";

export type SavedBrowserState = Awaited<ReturnType<BrowserContext["storageState"]>>;
export type BrowserGrantMode = "read" | "interact";
export interface BrowserGrant {
  host: string; mode: BrowserGrantMode; automation: boolean;
  savedAt: string; expiresAt: string;
}
interface StoredGrant { grant: BrowserGrant; state: SavedBrowserState }
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const ownerKey = (owner: string) => {
  const identity = owner.trim().toLowerCase();
  if (!identity || identity.length > 320 || !identity.includes("@")) throw new Error("Missing verified account identity");
  return hash("user:" + identity);
};
export function vaultHost(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.port && parsed.port !== "443" ||
      !parsed.hostname.includes(".") || parsed.username || parsed.password)
    throw new Error("Personal browser sessions require a public HTTPS hostname");
  return parsed.hostname.toLowerCase();
}
function rootDir() {
  // Never place this path under the Docker-mounted /work directory.
  const root = path.resolve(process.env.PROJECT_AGENT_SESSION_VAULT_DIR ??
    path.join(process.cwd(), "data", "project-agent", "personal-session-vault"));
  const workspace = path.resolve(process.cwd(), "data", "project-agent", "workspaces");
  if (root === workspace || root.startsWith(workspace + path.sep) ||
      workspace.startsWith(root + path.sep) || root === process.cwd())
    throw new Error("Session Vault directory must not overlap a sandbox workspace");
  return root;
}
function userPath(owner: string) { return path.join(rootDir(), ownerKey(owner)); }
function sitePath(owner: string, host: string) { return path.join(userPath(owner), hash("site:" + host) + ".json"); }
async function privateDirectory(dir: string) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Session Vault path is not a private directory");
  await fs.chmod(dir, 0o700);
}
async function atomicWrite(dest: string, json: unknown) {
  const temporary = dest + "." + randomUUID() + ".tmp";
  try {
    await fs.writeFile(temporary, JSON.stringify(json), { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, dest);
    await fs.chmod(dest, 0o600);
  } finally { await fs.unlink(temporary).catch(() => {}); }
}
async function getUserKey(owner: string, create: boolean): Promise<Buffer | null> {
  const dest = path.join(userPath(owner), "key.json");
  const master = masterVaultKey(); // no silent plaintext or disposable-key fallback
  const aad = "project-agent:user-key:v1:" + ownerKey(owner);
  let wrapped = await fs.readFile(dest, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!wrapped && create) {
    await privateDirectory(rootDir());
    await privateDirectory(userPath(owner));
    const userSecret = randomBytes(32);
    const ciphertext = JSON.stringify(seal(userSecret, master, aad));
    try { await fs.writeFile(dest, ciphertext, { flag: "wx", mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    wrapped = await fs.readFile(dest, "utf8");
    userSecret.fill(0);
  }
  return wrapped ? unseal(JSON.parse(wrapped) as SealedPayload, master, aad) : null;
}
function filteredState(host: string, state: SavedBrowserState): SavedBrowserState {
  const onHost = (name: string) => {
    const domain = name.replace(/^\./, "").toLowerCase();
    return host === domain || host.endsWith("." + domain);
  };
  const cookies = state.cookies.filter((cookie) => onHost(cookie.domain));
  const origins = state.origins.filter((record) => {
    try { return vaultHost(record.origin) === host; } catch { return false; }
  });
  if (cookies.length + origins.length === 0) throw new Error("No authenticated browser state on this site to save");
  return { cookies, origins };
}
export async function savePersonalBrowserGrant(owner: string, url: string,
  state: SavedBrowserState, mode: BrowserGrantMode, automation: boolean): Promise<BrowserGrant> {
  const host = vaultHost(url);
  const secret = await getUserKey(owner, true);
  if (!secret) throw new Error("Could not initialize account encryption key");
  const now = new Date();
  const days = Math.min(365, Math.max(1, Number(process.env.PROJECT_AGENT_SESSION_VAULT_DAYS) || 90));
  const grant: BrowserGrant = { host, mode, automation, savedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + days * 86_400_000).toISOString() };
  try {
    const payload = Buffer.from(JSON.stringify({ grant, state: filteredState(host, state) } satisfies StoredGrant));
    await atomicWrite(sitePath(owner, host), seal(payload, secret, "project-agent:site:v1:" + ownerKey(owner) + ":" + host));
    payload.fill(0);
    return grant;
  } finally { secret.fill(0); }
}
export async function readPersonalBrowserGrant(owner: string, url: string): Promise<StoredGrant | null> {
  const host = vaultHost(url);
  const secret = await getUserKey(owner, false);
  if (!secret) return null;
  try {
    const raw = await fs.readFile(sitePath(owner, host), "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!raw) return null;
    const value = JSON.parse(unseal(JSON.parse(raw) as SealedPayload, secret,
      "project-agent:site:v1:" + ownerKey(owner) + ":" + host).toString("utf8")) as StoredGrant;
    if (value.grant.host !== host || !["read", "interact"].includes(value.grant.mode) ||
      !Number.isFinite(Date.parse(value.grant.expiresAt))) throw new Error("Invalid stored website grant");
    if (Date.parse(value.grant.expiresAt) <= Date.now()) return null;
    return { grant: value.grant, state: filteredState(host, value.state) };
  } finally { secret.fill(0); }
}
export async function revokePersonalBrowserGrant(owner: string, url: string): Promise<void> {
  const host = vaultHost(url);
  await fs.unlink(sitePath(owner, host)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}
