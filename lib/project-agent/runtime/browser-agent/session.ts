import type { Browser, BrowserContext, Page } from "playwright-core";
import { BrowserSlotPool } from "./slot-pool";
import { bindG2BrowserOwnership, assertG2BrowserOwnership, changeG2HumanControl } from "./g2-ownership";
import { launchChromium } from "../browser-launcher";
import { installBrowserRouteGuard } from "./session-routing";
import { bindAbort } from "./safety";
import { readPersonalBrowserGrant, vaultHost } from "./personal-vault";
import { projectRecordByKey } from "./project-registry";
import { publicBrowserWatchLocation } from "./watch";
import { safeBrowserConsoleEntry } from "./privacy";
import { connectSteelSession, type SteelConnection } from "./steel-session";
import { withProjectControlOp } from "./project-control-db";
import { browserControlState } from "./control";
const MAX_CONTEXTS = 3;
const OP_TIMEOUT_MS = 35_000;
const IDLE_CLOSE_MS = 5 * 60_000;
/** Worker and Browser API routes are separate Next bundles; takeover must share their live Playwright session. */
const browserGlobal = globalThis as typeof globalThis & {
  __projectAgentBrowserSessions?: Map<string, BrowserSession>;
  __projectAgentBrowserOperationLocks?: WeakMap<BrowserSession, Promise<void>>;
  __projectAgentBrowserPending?: Map<string, Promise<BrowserSession>>;
};
const sessions = browserGlobal.__projectAgentBrowserSessions ??= new Map<string, BrowserSession>();
const pendingSessions = browserGlobal.__projectAgentBrowserPending ??= new Map<string, Promise<BrowserSession>>();
/** Synthetic P8 fixtures use a separate process-wide session registry. */
const qaGlobal = globalThis as typeof globalThis & {
  __projectAgentP8QaSessions?: Map<string, BrowserSession>;
};
const qaSessions = qaGlobal.__projectAgentP8QaSessions ??= new Map<string, BrowserSession>();
const qaActive = (id: string) => {
  if (process.env.PROJECT_AGENT_P8_QA_SESSION !== "1" || process.env.NODE_ENV === "production") return null;
  const session = qaSessions.get(id);
  if (session && (session.page.isClosed() || !session.browser.isConnected())) {
    qaSessions.delete(id); return null;
  }
  return session ?? null;
};
export function registerP8QaBrowserSession(id: string, session: BrowserSession): void {
  if (process.env.PROJECT_AGENT_P8_QA_SESSION !== "1" ||
      !["development", "test"].includes(process.env.NODE_ENV ?? "") ||
      !/^pat_[a-f0-9]{12}$/.test(id)) throw new Error("P8 QA browser registry disabled");
  if ([...qaSessions.keys()].some(other => other !== id))
    throw new Error("Only one isolated P8 synthetic browser fixture may be active");
  qaSessions.set(id, session);
}
const slots = new BrowserSlotPool(MAX_CONTEXTS);
let sharedBrowser: Promise<Browser> | null = null;
let browserIdleTimer: ReturnType<typeof setTimeout> | undefined;
const vaultMonitor = setInterval(() => {
  for (const session of sessions.values()) {
    if (!session.authHost || !session.owner || !session.authVersion) continue;
    void readPersonalBrowserGrant(session.owner, "https://" + session.authHost)
      .then(record => {
        if (!record || !record.grant.automation || record.grant.version !== session.authVersion)
          return session.close();
      })
      .catch(() => session.close()); // Vault unavailable: fail closed for authenticated browsers.
  }
}, 1000);
vaultMonitor.unref?.();
export interface BrowserSession {
	browser: Browser;
	g2RefEpoch?: number;
	owner?: string;
	chatId?: string;
  scopeId?: string; steelId?: string; viewerUrl?: string | null; persistent?: boolean; activeAgentTaskId?: string; steel?: boolean;
	authHost?: string;
	authMode?: "read" | "interact";
	authVersion?: string;
  lastAuthSavedAt?: number;
	context: BrowserContext;
	page: Page;
	lastSnapshot: string;
	snapshotUrl: string;
	refs: Map<string, string>;
	lastUsed: number;
	operationCount: number;
	console: string[];
	network: string[];
	close(): Promise<void>;
}
function trackPageTraffic(session: BrowserSession, page: Page): void {
  const append = (items: string[], value: string) => {
    items.push(value.slice(0, 500));
    if (items.length > 100) items.splice(0, items.length - 100);
  };
  page.on("console", message => {
    if (!session.authHost && ["error", "warning"].includes(message.type()))
      append(session.console, safeBrowserConsoleEntry(message.type()));
  });
  const redactedUrl = publicBrowserWatchLocation;
  page.on("requestfailed", request =>
    append(session.network, `FAILED ${request.method()} ${redactedUrl(request.url())}`));
  page.on("response", response =>
    append(session.network, `${response.status()} ${response.request().method()} ${redactedUrl(response.url())}`));
}
async function getSharedBrowser(): Promise<Browser> {
	if (browserIdleTimer) { clearTimeout(browserIdleTimer); browserIdleTimer = undefined; }
	if (sharedBrowser) {
    const live = await sharedBrowser.catch(() => null);
    if (!live?.isConnected()) { sharedBrowser = null; await closeAllBrowserSessions(); }
  }
  if (!sharedBrowser) sharedBrowser = launchChromium().catch((error) => { sharedBrowser = null; throw error; });
  return sharedBrowser;
}
export async function getBrowserSession(id: string, signal?: AbortSignal, owner?: string): Promise<BrowserSession> {
	const existing = sessions.get(id) ?? qaActive(id);
  if (existing?.persistent && owner) {
    const liveRecord = await projectRecordByKey(id, owner);
    if (!liveRecord || liveRecord.steelId !== existing.steelId) {
      await existing.close();
      if (!liveRecord) throw new Error("Shared browser was closed or expired");
      return getBrowserSession(id, signal, owner);
    }
  }
	if (existing) { if (existing.page.isClosed() || !existing.browser.isConnected()) { await existing.close(); return getBrowserSession(id, signal, owner); } if (owner && existing.owner && existing.owner !== owner.trim().toLowerCase()) throw new Error("Browser owner mismatch"); if (owner && !existing.owner) existing.owner = owner.trim().toLowerCase(); existing.lastUsed = Date.now(); return existing; }
	const pending = pendingSessions.get(id);
	if (pending) { const result = await pending; if (owner && result.owner !== owner.trim().toLowerCase()) throw new Error("Browser owner mismatch"); return result; }
	const creating = (async () => {
    const session = await createBrowserSession(id, signal, owner);
    try { await bindG2BrowserOwnership(id, session, owner); }
    catch (error) { await session.close().catch(() => {}); throw error; }
    return session;
  })();
	pendingSessions.set(id, creating);
	try { return await creating; } finally { pendingSessions.delete(id); }
}
async function createBrowserSession(id: string, signal?: AbortSignal, owner?: string): Promise<BrowserSession> {
	let session: BrowserSession | undefined;
	const releaseSlot = await slots.acquire(signal);
	let context: BrowserContext | undefined;
  let steelConnection: SteelConnection | null = null;
	try {
		if (signal?.aborted) throw new Error("Browser task was stopped");
        const record = id.startsWith("pb_") && owner ?
          await projectRecordByKey(id, owner) : null;
        if (id.startsWith("pb_") && !record?.steelId)
          throw new Error("Shared browser must be created through the project API");
        const steel = record?.steelId ?
          await connectSteelSession(record.steelId) : null;
        steelConnection = steel;
        const browser = steel?.browser ?? await getSharedBrowser();
        context = steel?.context ?? await browser.newContext({
          viewport: { width: 1280, height: 800 }, acceptDownloads: true, serviceWorkers: "block",
        });
        try { await installBrowserRouteGuard(context, () => session); }
        catch (error) { await steel?.disconnect(); throw error; }
        const page = steel && record ?
          (context.pages()[record.activeTabIndex ?? 0] ?? steel.page) :
          await context.newPage();
		let closed = false;
		session = {
			browser, context, page, scopeId: id, steelId: steel?.id, steel: Boolean(steel), viewerUrl: steel?.viewerUrl, persistent: Boolean(steel), owner: owner?.trim().toLowerCase(), refs: new Map(), snapshotUrl: "", lastSnapshot: "", lastUsed: Date.now(), operationCount: 0, console: [], network: [],
			close: async () => {
				if (closed) return;
				closed = true;
				if (sessions.get(id) === session) sessions.delete(id);
				if (steel) await steel.disconnect(); else await session!.context.close().catch(() => {});
				releaseSlot();
				if (!steel && slots.active === 0) {
					browserIdleTimer = setTimeout(() => { if (slots.active !== 0 || pendingSessions.size > 0) return; const current = sharedBrowser; sharedBrowser = null; void current?.then((instance) => instance.close()).catch(() => {}); }, 30_000);
					browserIdleTimer.unref?.();
				}
			},
		};
		trackPageTraffic(session, page);
		sessions.set(id, session);
		if (!steel) bindAbort(signal, () => { void session?.close(); });
		return session;
	} catch (cause) {
		if (steelConnection) await steelConnection.disconnect().catch(() => {});
    else await context?.close().catch(() => {});
		releaseSlot();
		throw cause;
	}
}
/** Read-only peek: a watcher must not launch an extra browser session. */
export function activeBrowserSession(id: string): BrowserSession | null { return sessions.get(id) ?? qaActive(id); }
export function closeBrowserSession(id: string): Promise<void> {
  const current = sessions.get(id) ?? qaSessions.get(id);
  qaSessions.delete(id);
  return current?.close() ?? Promise.resolve();
}
export function closeAllBrowserSessions(): Promise<void> {
  return Promise.all([...new Set([...sessions.keys(), ...qaSessions.keys()])].map(closeBrowserSession)).then(() => {});
}
const operationLocks = browserGlobal.__projectAgentBrowserOperationLocks ??= new WeakMap<BrowserSession, Promise<void>>();
export async function withBrowserOp<T>(session: BrowserSession, fn: () => Promise<T>,
  countAgentAction = true, ownershipMode: "agent" | "human" | "system" = "agent",
  agentTaskId?: string): Promise<T> {
	const preceding = operationLocks.get(session) ?? Promise.resolve();
	let unlock!: () => void;
	const current = new Promise<void>((resolve) => { unlock = resolve; });
	operationLocks.set(session, preceding.then(() => current));
	await preceding;
	if (session.page.isClosed() || !session.browser.isConnected()) { unlock(); throw new Error("Browser session is closed"); }
  if (!session.persistent && ownershipMode === "agent" && session.scopeId &&
      browserControlState(session.scopeId).paused) { unlock(); throw new Error("Browser is controlled by the user; wait for handback"); }
	if (countAgentAction) session.operationCount += 1;
	if (countAgentAction && session.operationCount > 60) { unlock(); throw new Error("Browser action limit (60) reached for this task"); }
	let humanLeaseChanged = false;
	try {
    if (ownershipMode === "human" && !session.persistent) {
      await changeG2HumanControl(session, "agent", "human");
      humanLeaseChanged = true;
    }
    if (session.persistent && ownershipMode === "agent" && !agentTaskId)
      throw new Error("Agent task identity is required for shared browser actions");
    await assertG2BrowserOwnership(session, ownershipMode === "human" ? "human" : "agent");
  } catch (error) {
    if (humanLeaseChanged) await changeG2HumanControl(session, "human", "agent").catch(() => session.close());
    unlock(); throw error;
  }
	session.lastUsed = Date.now();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const protectedOp = () => session.persistent && session.scopeId ?
      withProjectControlOp(session.scopeId, ownershipMode,
        ownershipMode === "agent" ? agentTaskId : undefined, async () => fn(),
        () => { void session.close().catch(() => {}); }) : fn();
    return await Promise.race([protectedOp(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Browser operation timed out after ${OP_TIMEOUT_MS / 1000} seconds`)), OP_TIMEOUT_MS);
    })]);
	} catch (error) {
    if (error instanceof Error && error.message === `Browser operation timed out after ${OP_TIMEOUT_MS / 1000} seconds`)
      await session.close().catch(() => {});
    throw error;
	} finally {
    if (timer) clearTimeout(timer);
    if (humanLeaseChanged) {
      try { await changeG2HumanControl(session, "human", "agent"); }
      catch (error) { await session.close().catch(() => {}); unlock(); throw error; }
    }
    unlock();
  }
}

export function scheduleIdleClose(session: BrowserSession, id: string): void {
	const idle = session.persistent ? 60 * 60_000 : IDLE_CLOSE_MS;
	setTimeout(() => { if (Date.now() - session.lastUsed >= idle) void closeBrowserSession(id); }, idle).unref?.();
}

/** Restore only an owner's granted host, not their whole browsing profile. */
export async function restorePersonalBrowserSession(session: BrowserSession, url: string): Promise<void> {
  if (!session.owner || session.steel) return; // Steel must retain the original CDP context.
  let host: string;
  try { host = vaultHost(url); } catch { return; }
  if (session.authHost === host) return;
  const record = await readPersonalBrowserGrant(session.owner, url);
  if (!record || !record.grant.automation) { session.authHost = undefined; session.authMode = undefined; session.authVersion = undefined; return; }
  // Install full cookies, localStorage and IndexedDB before the first navigation.
  const next = await session.browser.newContext({
    viewport: { width: 1280, height: 800 }, acceptDownloads: true,
    serviceWorkers: "block", storageState: record.state,
  });
  try {
    await installBrowserRouteGuard(next, () => session);
    const page = await next.newPage();
    const previous = session.context;
    session.context = next; session.page = page;
    trackPageTraffic(session, page);
    session.refs.clear(); session.snapshotUrl = ""; session.lastSnapshot = "";
    await previous.close();
  } catch (error) { await next.close().catch(() => {}); throw error; }
  session.authHost = host;
  session.authMode = record.grant.mode;
  session.authVersion = record.grant.version;
}

export async function closeBrowserSessionsForOwnerHost(owner: string, host: string): Promise<void> {
  await Promise.all([...sessions.values()].filter((session) => session.owner === owner.trim().toLowerCase() &&
    (session.authHost === host || (() => { try { return new URL(session.page.url()).hostname === host; } catch { return false; } })()))
    .map((session) => session.close()));
}

/** A freshly revoked grant cannot authorize a subsequent browser tool call. */
export async function assertPersonalBrowserPermission(session: BrowserSession, op: string): Promise<void> {
  if (!session.authHost || !session.owner) return;
  const record = await readPersonalBrowserGrant(session.owner, "https://" + session.authHost).catch(() => null);
  if (!record || !record.grant.automation || record.grant.version !== session.authVersion) {
    await session.close();
    throw new Error("Saved website access was revoked or changed");
  }
  const readOnly = ["open","back","snapshot","screenshot","extract","console","network","wait",
    "tabs","switch_tab","visual_observe","close"];
  if (record.grant.mode === "read" && !readOnly.includes(op))
    throw new Error("This website is authorized for read-only Agent access");
}

/** Deleting a task's sandbox must close its borrowed browser contexts, not its account Vault. */
export async function closeBrowserSessionsForChat(chatId: string): Promise<void> {
  await Promise.all([...sessions.values()]
    .filter(session => session.chatId === chatId && !session.persistent)
    .map(session => session.close()));
}

/** Process-local aggregate counters; excludes URLs, users, cookies and screenshots. */
export function browserResourceSnapshot() {
  return { activeContexts: slots.active, waitingContexts: slots.waiting,
    activeSessions: sessions.size, pendingSessions: pendingSessions.size };
}
