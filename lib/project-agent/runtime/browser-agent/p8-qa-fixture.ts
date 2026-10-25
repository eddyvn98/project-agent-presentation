import { activeBrowserSession, closeBrowserSession, getBrowserSession,
  registerP8QaBrowserSession } from "./session";
import { prepareP7BrowserFixture } from "./p7-fixture";
import { runBrowserAction } from "./index";
import { runP8BrowserLoopStep } from "./loop-step";
import { browserLoopStatus, clearBrowserLoop } from "./loop-state";
import { browserControlState, clearBrowserControl } from "./control";
import { browserWatchStatus, setBrowserWatch } from "./watch";
import { clearBrowserStall } from "./stall-guard";

const MAX_QA_LIFETIME_MS = 180_000;
const lifetime = globalThis as typeof globalThis & {
  __projectAgentP8QaTimers?: Map<string, ReturnType<typeof setTimeout>>;
};
const timers = lifetime.__projectAgentP8QaTimers ??= new Map<string, ReturnType<typeof setTimeout>>();
/** Local-only, no navigation or fetch. The underlying P7 page blocks all external resources. */
export async function prepareP8QaBrowser(taskId: string, owner: string) {
  const prior = activeBrowserSession(taskId);
  let clickPoint: { x: number; y: number } | null = null;
  if (!prior) {
    const session = await getBrowserSession(taskId, undefined, owner);
    // Last-installed context route has precedence over production guardedRequest:
    // the fixture never sends a request, including DNS, redirects or WebSockets.
    await session.context.route("**/*", route => route.abort("blockedbyclient"));
    const fixture = await prepareP7BrowserFixture(taskId, owner);
    if (!fixture.hasFrame) throw new Error("Synthetic Chromium did not produce a frame");
    clickPoint = fixture.clickPoint;
    registerP8QaBrowserSession(taskId, session);
  }
  clearTimeout(timers.get(taskId));
  const timer = setTimeout(() => { void cleanupP8QaBrowser(taskId); }, MAX_QA_LIFETIME_MS);
  timer.unref?.(); timers.set(taskId, timer);
  const session = activeBrowserSession(taskId);
  if (!session || !session.browser.isConnected()) throw new Error("QA browser not active");
  if (!clickPoint) {
    const bounds = await session.page.locator("#qa-count").boundingBox();
    const vp = session.page.viewportSize() ?? { width: 1280, height: 800 };
    clickPoint = bounds ? { x: (bounds.x + bounds.width / 2) / vp.width,
      y: (bounds.y + bounds.height / 2) / vp.height } : null;
  }
  return { connected: true, hasFrame: Boolean(browserWatchStatus(taskId)?.hasImage),
    clickPoint, pid: process.pid };
}
export function p8QaBrowserProbe(taskId: string) {
  const session = activeBrowserSession(taskId);
  return { connected: Boolean(session?.browser.isConnected() && !session.page.isClosed()),
    pid: process.pid, watching: Boolean(browserWatchStatus(taskId)?.watching),
    hasFrame: Boolean(browserWatchStatus(taskId)?.hasImage),
    control: browserControlState(taskId), loop: browserLoopStatus(taskId) };
}
/** Synthetic maker action through the EXACT browser runtime under QA. */
export async function runP8QaBrowserStep(taskId: string, owner: string,
  projectId: string, kind: "click" | "no_progress") {
  const session = activeBrowserSession(taskId);
  if (!session?.browser.isConnected() || session.page.isClosed())
    throw new Error("P8 QA session missing; restart the isolated one-process fixture");
  if (!await session.page.locator('[data-p7-synthetic="true"]').count() ||
      session.page.url() !== "about:blank")
    throw new Error("Not the isolated synthetic HTML page");
  if (browserControlState(taskId).paused) throw new Error("Release human browser control first");
  const input = { taskId, chatId: taskId, ownerEmail: owner, projectId,
    user: owner, query: "Synthetic P8 loop fixture only" };
  if (kind === "click") {
    const shot = await runBrowserAction(input, { action: "browser", op: "snapshot" }, 1);
    if (shot.failed) throw new Error("Synthetic DOM snapshot failed");
    const ref = await session.page.locator("#qa-count").getAttribute("data-agent-web-ref");
    if (!ref || !/^e\d+$/.test(ref)) throw new Error("Synthetic counter reference missing");
    const clicked = await runBrowserAction(input, { action: "browser", op: "click", ref }, 2);
    if (clicked.failed) return { ok: false, reason: "browser rejected synthetic click",
      loop: browserLoopStatus(taskId) };
  } else {
    // Intentionally NO DOM effect. Exercises independent checker, not an
    // invented successful browser action or an external site.
    const result = await runP8BrowserLoopStep(taskId, session,
      { action: "browser", op: "click", ref: "qa_no_progress" },
      undefined, async () => ({ text: "Synthetic no-op: no DOM change" }));
    if (result.failed) return { ok: false, blocked: true,
      loop: browserLoopStatus(taskId), connected: true, pid: process.pid };
  }
  const count = Number(await session.page.locator("#qa-output").textContent());
  return { ok: true, count, loop: browserLoopStatus(taskId),
    connected: session.browser.isConnected(), pid: process.pid };
}
export async function cleanupP8QaBrowser(taskId: string): Promise<void> {
  clearTimeout(timers.get(taskId)); timers.delete(taskId);
  await closeBrowserSession(taskId).catch(() => {});
  setBrowserWatch(taskId, false); clearBrowserControl(taskId);
  clearBrowserLoop(taskId); clearBrowserStall(taskId);
}
