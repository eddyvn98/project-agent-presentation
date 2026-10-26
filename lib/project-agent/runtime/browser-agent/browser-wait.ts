import type { BrowserAction } from "./action-parser";
import type { Page } from "playwright-core";
import { browserControlState, waitForBrowserIntervention } from "./control";

export async function waitForPageOrIntervention(
  page: Page, action: BrowserAction, taskId: string, signal?: AbortSignal,
): Promise<{ interrupted: boolean; text: string }> {
  const timeout = (action.seconds ?? 10) * 1000;
  const settlePage = async () => {
    if (action.find) {
      const found = await page.waitForFunction(
        needle => document.body.innerText.toLowerCase().includes(needle),
        action.find!.toLowerCase(), { timeout },
      ).then(() => true, () => false);
      return found
        ? `The text "${action.find}" is on the page now.`
        : `The text "${action.find}" did not appear within ${timeout / 1000} s. Take a snapshot to see what is there.`;
    }
    await page.waitForLoadState("networkidle", { timeout }).catch(() => undefined);
    return "Waited for the page to settle.";
  };

  const interrupt = new AbortController();
  const revision = browserControlState(taskId).revision;
  const relayAbort = () => interrupt.abort(signal?.reason ?? new Error("Task was cancelled"));
  signal?.addEventListener("abort", relayAbort, { once: true });
  try {
    const result = await Promise.race([
      settlePage().then(text => ({ interrupted: false, text })),
      waitForBrowserIntervention(taskId, revision, interrupt.signal).then(() => ({
        interrupted: true, text: "Browser wait interrupted because the user interacted with the shared browser. Reinspect the live page before continuing.",
      })),
    ]);
    return result;
  } finally {
    signal?.removeEventListener("abort", relayAbort);
    if (!interrupt.signal.aborted) interrupt.abort(new Error("Browser wait completed"));
  }
}
