import type { BrowserSession } from "./session";

const transient = /execution context was destroyed|navigating|frame was detached|frame has been detached|cannot find context with specified id/i;

/** Retry only read-only snapshots after navigation, never the action that caused it. */
export async function snapshotAfterNavigation(
  session: Pick<BrowserSession, "page">, snapshot: () => Promise<string>,
): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await snapshot(); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!transient.test(message) || attempt === 2) throw error;
      await session.page.waitForLoadState("domcontentloaded", { timeout: 4000 }).catch(() => {});
    }
  }
  throw new Error("Browser snapshot unavailable after navigation");
}
