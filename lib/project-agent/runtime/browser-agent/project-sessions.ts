import { createHash } from "node:crypto";
import { activeBrowserSession, closeBrowserSession, getBrowserSession,
  scheduleIdleClose, withBrowserOp, type BrowserSession } from "./session";
import { clearProjectBrowserControl, projectBrowserControl, takeProjectBrowser,
  releaseProjectBrowser, keepProjectBrowser } from "./project-control";
import { notifyBrowserIntervention } from "./control";
import { publicBrowserWatchLocation } from "./watch";
import { assertPublicHttpUrl } from "../web-security";
import { waitForProjectBrowser } from "./project-control";

const g = globalThis as typeof globalThis & {
  __projectBrowserPending?: Map<string, Promise<BrowserSession>>;
};
const pending = g.__projectBrowserPending ??= new Map<string, Promise<BrowserSession>>();
export function projectBrowserKey(projectId: string, owner: string): string {
  return "pb_" + createHash("sha256").update(JSON.stringify([
    projectId, owner.trim().toLowerCase(),
  ])).digest("hex").slice(0, 32);
}
export function activeProjectBrowser(projectId: string, owner: string): BrowserSession | null {
  if (process.env.PROJECT_AGENT_STEEL_BROWSER !== "1") return null;
  const session = activeBrowserSession(projectBrowserKey(projectId, owner));
  return session && session.owner === owner.trim().toLowerCase() &&
    session.browser.isConnected() && !session.page.isClosed() ? session : null;
}
export async function openProjectBrowser(projectId: string, owner: string): Promise<BrowserSession> {
  if (process.env.PROJECT_AGENT_STEEL_BROWSER !== "1")
    throw new Error("Steel project browser is not enabled on this host");
  const id = projectBrowserKey(projectId, owner);
  const existing = activeProjectBrowser(projectId, owner);
  if (existing) return existing;
  const creating = pending.get(id);
  if (creating) return creating;
  const work = getBrowserSession(id, undefined, owner);
  pending.set(id, work);
  try {
    const session = await work;
    session.persistent = true;
    scheduleIdleClose(session, id);
    return session;
  } finally { pending.delete(id); }
}
/** Attach model actions to the already-open user browser, without binding Stop to its lifetime. */
export async function agentBrowserSession(input: {
  projectId?: string; ownerEmail?: string; taskId?: string;
  chatId: string; signal?: AbortSignal;
}, fallbackId: string) {
  const shared = input.projectId && input.ownerEmail ?
    activeProjectBrowser(input.projectId, input.ownerEmail) : null;
  const id = shared?.scopeId ?? fallbackId;
  if (shared) await waitForProjectBrowser(id, input.signal);
  const session = await getBrowserSession(id, shared ? undefined : input.signal, input.ownerEmail);
  if (shared) {
    if (session.activeAgentTaskId !== input.taskId) {
      session.activeAgentTaskId = input.taskId;
      session.operationCount = 0;
      session.refs.clear(); session.snapshotUrl = ""; session.lastSnapshot = "";
    }
  } else session.chatId = input.chatId;
  return { id, session, shared: Boolean(shared) };
}
export async function stopProjectBrowser(projectId: string, owner: string): Promise<void> {
  const id = projectBrowserKey(projectId, owner);
  const inflight = pending.get(id);
  if (inflight) await inflight.catch(() => undefined);
  clearProjectBrowserControl(id);
  await closeBrowserSession(id);
}
export function projectBrowserStatus(session: BrowserSession) {
  const pages = session.context.pages().filter(page => !page.isClosed());
  return {
    connected: true, viewerUrl: session.viewerUrl ?? null,
    control: projectBrowserControl(session.scopeId ?? ""),
    tabs: pages.map((page, index) => ({ index, location: publicBrowserWatchLocation(page.url()),
      active: page === session.page })),
    viewport: session.page.viewportSize() ?? { width: 1280, height: 800 },
  };
}
function noteUserAction(session: BrowserSession) {
  session.lastUsed = Date.now();
  if (session.activeAgentTaskId) notifyBrowserIntervention(session.activeAgentTaskId);
}
export async function projectBrowserOperation(session: BrowserSession,
  input: { op: string; url?: string; tabIndex?: number; width?: number; height?: number }) {
  const id = session.scopeId!;
  if (input.op === "heartbeat") { keepProjectBrowser(id); session.lastUsed = Date.now(); return; }
  if (input.op === "release") {
    releaseProjectBrowser(id); noteUserAction(session); return;
  }
  if (input.op === "takeover") {
    await withBrowserOp(session, async () => takeProjectBrowser(id), false, "human");
    noteUserAction(session); return;
  }
  if (!projectBrowserControl(id).paused && input.op !== "viewport")
    throw new Error("Take control before changing the browser");
  await withBrowserOp(session, async () => {
    const pages = session.context.pages().filter(page => !page.isClosed());
    if (input.op === "navigate") {
      if (!input.url) throw new Error("A website URL is required");
      await assertPublicHttpUrl(input.url);
      await session.page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    } else if (input.op === "new_tab") {
      if (pages.length >= 8) throw new Error("Maximum eight tabs per session");
      const page = await session.context.newPage();
      if (input.url) {
        try {
          await assertPublicHttpUrl(input.url);
          await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
        } catch (error) { await page.close(); throw error; }
      }
      session.page = page;
    } else if (input.op === "switch_tab") {
      const page = pages[input.tabIndex ?? -1];
      if (!page) throw new Error("Tab not found");
      session.page = page;
    } else if (input.op === "close_tab") {
      if (pages.length < 2) throw new Error("Cannot close the last browser tab");
      const page = pages[input.tabIndex ?? -1];
      if (!page) throw new Error("Tab not found");
      await page.close();
      if (session.page === page) session.page = session.context.pages()[0];
    } else if (input.op === "viewport") {
      const width = input.width ?? 0, height = input.height ?? 0;
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
        width < 320 || width > 1920 || height < 480 || height > 1080)
        throw new Error("Unsupported browser viewport");
      await session.page.setViewportSize({ width, height });
    } else throw new Error("Unsupported browser operation");
    await session.page.bringToFront();
    session.refs.clear(); session.snapshotUrl = ""; session.lastSnapshot = "";
    noteUserAction(session);
  }, false, "human");
}
