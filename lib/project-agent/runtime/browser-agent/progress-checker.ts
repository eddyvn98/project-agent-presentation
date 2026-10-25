import type { BrowserSession } from "./session";
import type { BrowserAction } from "./action-parser";

/** Independent read-only checker. Verified means OBSERVABLE progress, not user-goal success. */
export interface BrowserProof { verified: boolean; reason: "value_matched" | "navigation" | "page_changed" | "not_observable" }
export async function verifyBrowserProgress(session: BrowserSession, action: BrowserAction,
  before: { url: string; snapshot: string }): Promise<BrowserProof> {
  if (action.op === "type" || action.op === "select") {
    const selector = session.refs.get(action.ref ?? "");
    if (selector && (action.op === "type" ? action.text !== undefined : action.value !== undefined)) {
      const value = await session.page.locator(selector).inputValue({ timeout: 1500 })
        .catch(() => null);
      const expected = action.op === "type" ? action.text : action.value;
      if (value !== null && value === expected)
        return { verified: true, reason: "value_matched" };
    }
  }
  if (session.page.url() !== before.url)
    return { verified: true, reason: "navigation" };
  // Compare DOM snapshots already captured by the normal browser action.
  if (session.lastSnapshot && session.lastSnapshot !== before.snapshot)
    return { verified: true, reason: "page_changed" };
  // A click may succeed without changing visible DOM (analytics, animations,
  // external side effects). Never claim those actions succeeded at the goal.
  return { verified: false, reason: "not_observable" };
}
