import type { Browser, BrowserContext, Page } from "playwright-core";
import { launchChromium } from "../browser-launcher";
import { guardedRequest } from "../guarded-fetch";
import { assertPublicWebSocketUrl, bindAbort } from "./safety";
import { readPersonalBrowserGrant, vaultHost } from "./personal-vault";

const MAX_CONTEXTS = 3;
const OP_TIMEOUT_MS = 30_000;
const IDLE_CLOSE_MS = 5 * 60_000;
const sessions = new Map<string, BrowserSession>();
const pendingSessions = new Map<string, Promise<BrowserSession>>();
const waiters: Array<() => void> = [];
let occupiedSlots = 0;
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
	owner?: string;
	chatId?: string;
	authHost?: string;
	authMode?: "read" | "interact";
	authVersion?: string;
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
  page.on("console", message => {
    if (!session.authHost && ["error", "warning"].includes(message.type()))
      session.console.push(`${message.type()}: ${message.text()}`);
  });
  const redactedUrl = (raw: string) => {
    try { const u = new URL(raw); return u.origin + u.pathname.slice(0, 140); }
    catch { return "[unavailable]"; }
  };
  page.on("requestfailed", request =>
    session.network.push(`FAILED ${request.method()} ${redactedUrl(request.url())}`));
  page.on("response", response =>
    session.network.push(`${response.status()} ${response.request().method()} ${redactedUrl(response.url())}`));
}
async function getSharedBrowser(): Promise<Browser> {
	if (browserIdleTimer) clearTimeout(browserIdleTimer);
	if (!sharedBrowser) sharedBrowser = launchChromium().catch((error) => { sharedBrowser = null; throw error; });
	return sharedBrowser;
}

async function routeGuard(context: BrowserContext, current: () => BrowserSession | undefined): Promise<void> {
	await context.routeWebSocket(/.*/, async (socket) => {
		try { await assertPublicWebSocketUrl(socket.url()); } catch { /* blocked below */ }
		await socket.close();
	});
	await context.route("**/*", async (route) => {
		try {
			const req = route.request();
      const active = current();
      if (active?.authMode === "read" && !["GET","HEAD","OPTIONS"].includes(req.method().toUpperCase())) {
        await route.abort("blockedbyclient").catch(() => {});
        return;
      }
			const { host: _host, "content-length": _length, ...headers } = await req.allHeaders();
			const response = await guardedRequest(req.url(), {
				method: req.method(), headers, body: req.postDataBuffer() ?? undefined,
				timeoutMs: OP_TIMEOUT_MS, maxBytes: 25 * 1024 * 1024,
			});
			// A cut-off body would hand the page (or a download) a corrupted file; fail the request instead.
			if (response.truncated) { await route.abort("failed").catch(() => {}); return; }
			await route.fulfill({ status: response.status, headers: response.headers, body: response.body });
		} catch { await route.abort("blockedbyclient").catch(() => {}); }
	});
}

async function acquireSlot(): Promise<void> {
	if (occupiedSlots < MAX_CONTEXTS) { occupiedSlots += 1; return; }
	await new Promise<void>((resolve) => waiters.push(resolve));
	occupiedSlots += 1;
}

export async function getBrowserSession(id: string, signal?: AbortSignal, owner?: string): Promise<BrowserSession> {
	const existing = sessions.get(id);
	if (existing) { if (owner && existing.owner && existing.owner !== owner.trim().toLowerCase()) throw new Error("Browser owner mismatch"); if (owner && !existing.owner) existing.owner = owner.trim().toLowerCase(); existing.lastUsed = Date.now(); return existing; }
	const pending = pendingSessions.get(id);
	if (pending) { const result = await pending; if (owner && result.owner !== owner.trim().toLowerCase()) throw new Error("Browser owner mismatch"); return result; }
	const creating = createBrowserSession(id, signal, owner);
	pendingSessions.set(id, creating);
	try { return await creating; } finally { pendingSessions.delete(id); }
}

async function createBrowserSession(id: string, signal?: AbortSignal, owner?: string): Promise<BrowserSession> {
	let session: BrowserSession | undefined;
	await acquireSlot();
	let context: BrowserContext | undefined;
	try {
		if (signal?.aborted) throw new Error("Browser task was stopped");
		const browser = await getSharedBrowser();
		context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, serviceWorkers: "block" });
		await routeGuard(context, () => session);
		const page = await context.newPage();
		let closed = false;
		session = {
			browser, context, page, owner: owner?.trim().toLowerCase(), refs: new Map(), snapshotUrl: "", lastSnapshot: "", lastUsed: Date.now(), operationCount: 0, console: [], network: [],
			close: async () => {
				if (closed) return;
				closed = true;
				sessions.delete(id);
				await session!.context.close();
				occupiedSlots -= 1;
				waiters.shift()?.();
				if (occupiedSlots === 0) {
					browserIdleTimer = setTimeout(() => { const current = sharedBrowser; sharedBrowser = null; void current?.then((instance) => instance.close()).catch(() => {}); }, 30_000);
					browserIdleTimer.unref?.();
				}
			},
		};
		trackPageTraffic(session, page);
		sessions.set(id, session);
		bindAbort(signal, () => { void session?.close(); });
		return session;
	} catch (cause) {
		await context?.close().catch(() => {});
		occupiedSlots -= 1;
		waiters.shift()?.();
		throw cause;
	}
}

/** Read-only peek: a watcher must not launch an extra browser session. */
export function activeBrowserSession(id: string): BrowserSession | null { return sessions.get(id) ?? null; }

export function closeBrowserSession(id: string): Promise<void> { return sessions.get(id)?.close() ?? Promise.resolve(); }
export function closeAllBrowserSessions(): Promise<void> { return Promise.all([...sessions.keys()].map(closeBrowserSession)).then(() => {}); }

const operationLocks = new WeakMap<BrowserSession, Promise<void>>();
export async function withBrowserOp<T>(session: BrowserSession, fn: () => Promise<T>, countAgentAction = true): Promise<T> {
	const preceding = operationLocks.get(session) ?? Promise.resolve();
	let unlock!: () => void;
	const current = new Promise<void>((resolve) => { unlock = resolve; });
	operationLocks.set(session, preceding.then(() => current));
	await preceding;
	if (countAgentAction) session.operationCount += 1;
	if (countAgentAction && session.operationCount > 60) { unlock(); throw new Error("Browser action limit (60) reached for this task"); }
	session.lastUsed = Date.now();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([fn(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Browser operation timed out after 30 seconds")), OP_TIMEOUT_MS); })]);
	} finally { if (timer) clearTimeout(timer); unlock(); }
}

export function scheduleIdleClose(session: BrowserSession, id: string): void {
	setTimeout(() => { if (Date.now() - session.lastUsed >= IDLE_CLOSE_MS) void closeBrowserSession(id); }, IDLE_CLOSE_MS).unref?.();
}

/** Restore only an owner's granted host, not their whole browsing profile. */
export async function restorePersonalBrowserSession(session: BrowserSession, url: string): Promise<void> {
  if (!session.owner) return;
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
    await routeGuard(next, () => session);
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
    .filter(session => session.chatId === chatId)
    .map(session => session.close()));
}
