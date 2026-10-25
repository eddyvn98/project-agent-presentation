import { closeBrowserSession } from "./runtime/browser-agent/session";
import { setBrowserWatch } from "./runtime/browser-agent/watch";
import { browserControlState, clearBrowserControl } from "./runtime/browser-agent/control";

/** Rejecting a prepared fixture must not retain a frame, control entry or Chromium context. */
export async function cleanupP7DiscardedBrowser(taskId: string): Promise<boolean> {
  if (browserControlState(taskId).paused) return false;
  // These synchronous updates happen before the first await: no stale Watch exposure.
  setBrowserWatch(taskId, false);
  clearBrowserControl(taskId);
  await closeBrowserSession(taskId);
  return true;
}
