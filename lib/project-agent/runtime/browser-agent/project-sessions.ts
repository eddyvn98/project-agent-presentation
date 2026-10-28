import { createHash } from "node:crypto";
import { activeBrowserSession, closeBrowserSession, getBrowserSession,
  withBrowserOp, type BrowserSession } from "./session";
import { notifyBrowserIntervention } from "./control";
import { publicBrowserWatchLocation } from "./watch";
import { assertPublicHttpUrl } from "../web-security";
import { privateProjectViewerUrl } from "./viewer-gateway";
import { closeProjectRecord, ensureProjectRecord, findProjectRecord,
  projectRecordByKey, touchProjectRecord, updateProjectActiveTab } from "./project-registry";
import { claimProjectAgent, clearProjectControl, handbackProjectControl,
  keepProjectControl, readProjectControl, releaseProjectAgent,
  takeProjectControl, waitForProjectControl } from "./project-control-db";

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
  return session?.persistent && session.owner === owner.trim().toLowerCase() &&
    session.browser.isConnected() && !session.page.isClosed() ? session : null;
}
export async function findProjectBrowser(projectId: string, owner: string) {
  if (process.env.PROJECT_AGENT_STEEL_BROWSER !== "1") return null;
  const key = projectBrowserKey(projectId, owner);
  const record = await findProjectRecord(key, projectId, owner);
  if (!record?.steelId) return null;
  const local = activeProjectBrowser(projectId, owner);
  if (local?.steelId && local.steelId !== record.steelId)
    await closeBrowserSession(key); // Disconnect obsolete worker attachment; do not release Steel.
  const session = await getBrowserSession(key, undefined, owner);
  await syncProjectTab(session);
  return session;
}
async function syncProjectTab(session: BrowserSession) {
  if (!session.steelId || !session.scopeId || !session.owner) return;
  const state = await projectRecordByKey(session.scopeId, session.owner);
  if (!state || state.steelId !== session.steelId)
    throw new Error("Stale Project browser connection");
  const pages = session.context.pages().filter(page => !page.isClosed());
  const page = pages[state.activeTabIndex ?? 0] ?? pages[0];
  if (page && page !== session.page) {
    session.page = page;
    session.refs.clear(); session.snapshotUrl = ""; session.lastSnapshot = "";
  }
}
/** Idempotent across Next workers: Mongo CAS creates one Steel session per owner/project. */
export async function openProjectBrowser(projectId: string, owner: string, signal?: AbortSignal,
  allowReopen = false) {
  if (process.env.PROJECT_AGENT_STEEL_BROWSER !== "1")
    throw new Error("Shared browser feature is disabled");
  const key = projectBrowserKey(projectId, owner);
  const existing = await findProjectBrowser(projectId, owner);
  if (existing) return existing;
  const current = pending.get(key);
  if (current) return current;
  const work = (async () => {
    await ensureProjectRecord(key, projectId, owner, signal, allowReopen);
    const previous = activeProjectBrowser(projectId, owner);
    const record = await projectRecordByKey(key, owner);
    if (previous && record?.steelId !== previous.steelId) await previous.close();
    const session = await getBrowserSession(key, undefined, owner);
    session.persistent = true;
    return session;
  })();
  pending.set(key, work);
  try { return await work; }
  finally { pending.delete(key); }
}
export async function agentBrowserSession(input: {
  projectId?: string; ownerEmail?: string; taskId?: string;
  chatId: string; signal?: AbortSignal;
}, fallbackId: string) {
  if (input.projectId && input.ownerEmail &&
      process.env.PROJECT_AGENT_STEEL_BROWSER === "1") {
    if (!input.taskId) throw new Error("Shared Agent browser requires a task id");
    const session = await openProjectBrowser(input.projectId, input.ownerEmail, input.signal);
    const id = session.scopeId!;
    await waitForProjectControl(id, input.signal);
    await syncProjectTab(session);
    await claimProjectAgent(id, input.taskId);
    if (session.activeAgentTaskId !== input.taskId) {
      session.activeAgentTaskId = input.taskId;
      session.operationCount = 0;
      session.refs.clear(); session.snapshotUrl = ""; session.lastSnapshot = "";
    }
    return { id, session, shared: true };
  }
  const session = await getBrowserSession(fallbackId, input.signal, input.ownerEmail);
  session.chatId = input.chatId;
  return { id: fallbackId, session, shared: false };
}
export async function finishProjectAgent(projectId: string, owner: string, taskId?: string) {
  if (!taskId || process.env.PROJECT_AGENT_STEEL_BROWSER !== "1") return;
  const id = projectBrowserKey(projectId, owner);
  await releaseProjectAgent(id, taskId);
  const local = activeProjectBrowser(projectId, owner);
  if (local?.activeAgentTaskId === taskId) local.activeAgentTaskId = undefined;
}
export async function stopProjectBrowser(projectId: string, owner: string) {
  const id = projectBrowserKey(projectId, owner);
  const inflight = pending.get(id);
  if (inflight) await inflight.catch(() => undefined);
  await closeProjectRecord(id, projectId, owner);
  await clearProjectControl(id);
  await closeBrowserSession(id);
}
/** QA-only opaque proof for comparing the same Steel ID across separate Next workers.
 * Never return a raw Steel session identifier, websocket URL or bearer token. */
function steelQaSessionProof(session: BrowserSession): string | undefined {
  if (!["development", "test"].includes(process.env.NODE_ENV ?? "") ||
      process.env.STEEL_QA_ALLOW_LIVE !== "1" ||
      process.env.STEEL_QA_DB_ISOLATION_ATTESTED !== "1" ||
      process.env.G2_QA_DB_ISOLATION_ATTESTED !== "1" ||
      process.env.PROJECT_AGENT_STEEL_BROWSER !== "1" ||
      !session.persistent || !session.steelId || !session.scopeId || !session.owner)
    return undefined;
  return createHash("sha256").update(["steel-qa-v1", session.scopeId,
    session.owner.trim().toLowerCase(), session.steelId].join("\0"))
    .digest("hex").slice(0, 24);
}
export async function projectBrowserStatus(session: BrowserSession, projectId?: string) {
  const id = session.scopeId!;
  const pages = session.context.pages().filter(page => !page.isClosed());
  const control = await readProjectControl(id);
  const qaSessionProof = steelQaSessionProof(session);
  const privateViewer = process.env.PROJECT_AGENT_STEEL_PRIVATE_VIEWER === "1";
  const viewerUrl = privateViewer ?
    (session.viewerUrl && projectId ? privateProjectViewerUrl(projectId) : null) :
    session.viewerUrl ?? null;
  return { connected: true, viewerUrl, control,
    ...(qaSessionProof ? { qaSessionProof } : {}),
    tabs: pages.map((page, index) => ({ index, location: publicBrowserWatchLocation(page.url()),
      active: page === session.page })),
    viewport: session.page.viewportSize() ?? { width: 1280, height: 800 },
  };
}
function noteUserAction(session: BrowserSession) {
  session.lastUsed = Date.now();
  if (session.steelId && session.scopeId)
    void touchProjectRecord(session.scopeId, session.steelId).catch(() => {});
  if (session.activeAgentTaskId) notifyBrowserIntervention(session.activeAgentTaskId);
}
export async function projectBrowserOperation(session: BrowserSession,
  input: { op: string; url?: string; tabIndex?: number; width?: number; height?: number;
    x?: number; y?: number; deltaY?: number; text?: string; key?: string }) {
  const id = session.scopeId!;
  if (input.op === "heartbeat") {
    if (!await keepProjectControl(id)) throw new Error("Browser takeover expired");
    noteUserAction(session); return;
  }
  if (input.op === "release") {
    await handbackProjectControl(id); noteUserAction(session); return;
  }
  if (input.op === "takeover") {
    await takeProjectControl(id); noteUserAction(session); return;
  }
  const control = await readProjectControl(id);
  if (!control.paused)
    throw new Error("Take control before changing the browser");
  await withBrowserOp(session, async () => {
    const pages = session.context.pages().filter(page => !page.isClosed());
    if (input.op === "click") {
      if (typeof input.x !== "number" || typeof input.y !== "number" ||
          !Number.isFinite(input.x) || !Number.isFinite(input.y) ||
          input.x < 0 || input.x > 1 || input.y < 0 || input.y > 1)
        throw new Error("Invalid browser click coordinates");
      const viewport = session.page.viewportSize();
      if (!viewport) throw new Error("Browser viewport unavailable");
      await session.page.mouse.click(Math.round(input.x * (viewport.width - 1)),
        Math.round(input.y * (viewport.height - 1)));
    } else if (input.op === "wheel") {
      if (typeof input.deltaY !== "number" || !Number.isFinite(input.deltaY) ||
          Math.abs(input.deltaY) > 1200) throw new Error("Invalid browser wheel delta");
      await session.page.mouse.wheel(0, input.deltaY);
    } else if (input.op === "type") {
      if (typeof input.text !== "string" || !input.text ||
          input.text.length > 1000) throw new Error("Invalid browser input");
      await session.page.keyboard.insertText(input.text);
    } else if (input.op === "key") {
      const allowed = new Set(["Enter", "Tab", "Backspace", "Delete", "Escape",
        "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End",
        "PageUp", "PageDown", "Space", "ControlOrMeta+A"]);
      if (!input.key || !allowed.has(input.key))
        throw new Error("Unsupported remote key");
      await session.page.keyboard.press(input.key);
    } else if (input.op === "navigate") {
      if (!input.url) throw new Error("Website URL required");
      await assertPublicHttpUrl(input.url);
      await session.page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    } else if (input.op === "new_tab") {
      if (pages.length >= 8) throw new Error("Eight-tab session limit reached");
      const page = await session.context.newPage();
      if (input.url) {
        try {
          await assertPublicHttpUrl(input.url);
          await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
        } catch (error) { await page.close(); throw error; }
      }
      session.page = page;
    } else if (input.op === "switch_tab") {
      const target = pages[input.tabIndex ?? -1];
      if (!target) throw new Error("Browser tab not found");
      session.page = target;
    } else if (input.op === "close_tab") {
      if (pages.length < 2) throw new Error("Cannot close final tab");
      const target = pages[input.tabIndex ?? -1];
      if (!target) throw new Error("Browser tab not found");
      await target.close();
      if (session.page === target) session.page = session.context.pages()[0];
    } else if (input.op === "viewport") {
      const width = input.width ?? 0, height = input.height ?? 0;
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
          width < 320 || width > 1920 || height < 480 || height > 1080)
        throw new Error("Unsupported viewport size");
      await session.page.setViewportSize({ width, height });
    } else throw new Error("Unsupported browser operation");
    await session.page.bringToFront();
    if (session.steelId) {
      const current = session.context.pages().filter(page => !page.isClosed());
      await updateProjectActiveTab(id, session.steelId,
        Math.max(0, current.indexOf(session.page)));
    }
    session.refs.clear(); session.snapshotUrl = ""; session.lastSnapshot = "";
    noteUserAction(session);
  }, false, "human");
}
