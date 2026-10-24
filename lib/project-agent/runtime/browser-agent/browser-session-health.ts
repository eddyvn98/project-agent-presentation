import type { BrowserSession } from "./session";
import { refreshPersonalBrowserState } from "./personal-vault";

/** A login challenge is not a failure to be bypassed; tell the owner to reauthenticate. */
export async function checkSavedBrowserHealth(session: BrowserSession): Promise<string | null> {
  if (!session.owner || !session.authHost || !session.authVersion) return null;
  const page = session.page;
  const visiblePassword = await page.locator('input[type="password"]').first()
    .isVisible().catch(() => false);
  let pathname = "";
  try { pathname = new URL(page.url()).pathname; } catch { return null; }
  if (visiblePassword && /login|sign.?in|auth|session|account/i.test(pathname))
    return "The saved website session needs reauthentication. Ask its owner to sign in privately in Browser Watch; do not try to solve MFA or CAPTCHA.";
  if (!page.url().startsWith("https://" + session.authHost + "/")) return null;
  if (visiblePassword) return null;
  const now = Date.now();
  if (now - (session.lastAuthSavedAt ?? 0) < 120_000) return null;
  session.lastAuthSavedAt = now;
  try {
    const state = await session.context.storageState({ indexedDB: true });
    await refreshPersonalBrowserState(session.owner, "https://" + session.authHost,
      session.authVersion, state);
  } catch { /* Saved state is optional; never expose tokens or redirect them to a model. */ }
  return null;
}
