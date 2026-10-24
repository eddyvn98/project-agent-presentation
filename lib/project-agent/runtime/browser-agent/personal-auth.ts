import { activeBrowserSession, withBrowserOp } from "./session";
import { browserControlState } from "./control";
import { vaultHost, savePersonalBrowserGrant, revokePersonalBrowserGrant, readPersonalBrowserGrant, type BrowserGrantMode } from "./personal-vault";
import { closeBrowserSessionsForOwnerHost } from "./session";

interface Consent { owner: string; host: string; expires: number }
const consents = new Map<string, Consent>();
const TIMEOUT = 10 * 60_000;
function requireOwner(taskId: string, owner: string) {
  const session = activeBrowserSession(taskId);
  if (!session || !owner || !browserControlState(taskId).paused)
    throw new Error("Take exclusive browser control before managing a personal login");
  return session;
}
export async function personalLoginStatus(taskId: string, owner: string) {
  const session = activeBrowserSession(taskId);
  const url = session?.page.url() ?? "";
  try {
    const host = vaultHost(url);
    const grant = (await readPersonalBrowserGrant(owner, url))?.grant ?? null;
    return { host, grant, preparing: isPersonalLoginPreparing(taskId, owner) };
  } catch { return { host: "", grant: null, preparing: false }; }
}
export function isPersonalLoginPreparing(taskId: string, owner: string) {
  const consent = consents.get(taskId);
  if (!consent) return false;
  if (consent.expires <= Date.now()) { consents.delete(taskId); return false; }
  return consent.owner === owner.trim().toLowerCase();
}
export function forgetPersonalLogin(taskId: string) { consents.delete(taskId); }
export async function beginPersonalLogin(taskId: string, owner: string) {
  const session = requireOwner(taskId, owner);
  const host = vaultHost(session.page.url());
  consents.set(taskId, { owner: owner.trim().toLowerCase(), host, expires: Date.now() + TIMEOUT });
  return { host, preparing: true };
}
export async function enterPersonalLoginSecret(taskId: string, owner: string, text: string) {
  if (!isPersonalLoginPreparing(taskId, owner) || !text || text.length > 2048 ||
      /[\x00-\x08\x0b-\x1f]/.test(text))
    throw new Error("Explicit login consent or valid credential required");
  const session = requireOwner(taskId, owner);
  await withBrowserOp(session, async () => {
    const details = await session.page.evaluate(() => {
      const input = document.activeElement as HTMLInputElement | null;
      return { tag: input?.tagName.toLowerCase(), type: input?.getAttribute("type") ?? "",
        name: input?.getAttribute("name") ?? "", autocomplete: input?.getAttribute("autocomplete") ?? "" };
    });
    // Only the human-driven credential flow can type into protected fields.
    if (!["input", "textarea"].includes(details.tag ?? "") ||
        !/password|otp|one.time|2fa|verification|security.code|auth.code/i.test(
          [details.type, details.name, details.autocomplete].join(" ")))
      throw new Error("Focus a password or verification-code field first");
    await session.page.keyboard.insertText(text);
  }, false);
  return { ok: true }; // NEVER return the secret, include it in logs, or forward it to the model
}
export async function submitPersonalLoginField(taskId: string, owner: string) {
  if (!isPersonalLoginPreparing(taskId, owner)) throw new Error("Login consent has expired");
  const session = requireOwner(taskId, owner);
  await withBrowserOp(session, async () => {
    const field = await session.page.evaluate(() => {
      const input = document.activeElement as HTMLInputElement | null;
      return { tag: input?.tagName.toLowerCase(), type: input?.getAttribute("type") ?? "",
        name: input?.getAttribute("name") ?? "", autocomplete: input?.getAttribute("autocomplete") ?? "" };
    });
    if (!["input", "textarea"].includes(field.tag ?? "") ||
        !/password|otp|one.time|2fa|verification|security.code|auth.code/i.test(
          [field.type, field.name, field.autocomplete].join(" ")))
      throw new Error("Focus the password or verification-code field first");
    await session.page.keyboard.press("Enter");
  }, false);
  return { ok: true };
}
export async function savePersonalLogin(taskId: string, owner: string,
  mode: BrowserGrantMode, automation: boolean) {
  const session = requireOwner(taskId, owner);
  if (!isPersonalLoginPreparing(taskId, owner)) throw new Error("Login consent has expired");
  const consent = consents.get(taskId)!;
  if (vaultHost(session.page.url()) !== consent.host)
    throw new Error("Return to the original website before saving its login");
  const state = await withBrowserOp(session, () => session.context.storageState({ indexedDB: true }), false);
  const grant = await savePersonalBrowserGrant(owner, session.page.url(), state, mode, automation);
  forgetPersonalLogin(taskId);
  return { grant };
}
export async function revokePersonalLogin(owner: string, url: string) {
  const host = vaultHost(url);
  await revokePersonalBrowserGrant(owner, url);
  await closeBrowserSessionsForOwnerHost(owner, host);
  return { ok: true };
}
