import type { Browser, BrowserContext, Page } from "playwright-core";
import { launchChromium } from "../browser-launcher";
import { guardedRequest } from "../guarded-fetch";
import { assertPublicWebSocketUrl, bindAbort } from "./safety";

const MAX_CONTEXTS = 3;
const OP_TIMEOUT_MS = 30_000;
const IDLE_CLOSE_MS = 5 * 60_000;
const sessions = new Map<string, BrowserSession>();
const pendingSessions = new Map<string, Promise<BrowserSession>>();
const waiters: Array<() => void> = [];
let occupiedSlots = 0;
let sharedBrowser: Promise<Browser> | null = null;
let browserIdleTimer: ReturnType<typeof setTimeout> | undefined;

export interface BrowserSession {
	browser: Browser;
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

async function getSharedBrowser(): Promise<Browser> {
	if (browserIdleTimer) clearTimeout(browserIdleTimer);
	if (!sharedBrowser) sharedBrowser = launchChromium().catch((error) => { sharedBrowser = null; throw error; });
	return sharedBrowser;
}

async function routeGuard(context: BrowserContext): Promise<void> {
	await context.routeWebSocket(/.*/, async (socket) => {
		try { await assertPublicWebSocketUrl(socket.url()); } catch { /* blocked below */ }
		await socket.close();
	});
	await context.route("**/*", async (route) => {
		try {
			const req = route.request();
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

export async function getBrowserSession(id: string, signal?: AbortSignal): Promise<BrowserSession> {
	const existing = sessions.get(id);
	if (existing) { existing.lastUsed = Date.now(); return existing; }
	const pending = pendingSessions.get(id);
	if (pending) return pending;
	const creating = createBrowserSession(id, signal);
	pendingSessions.set(id, creating);
	try { return await creating; } finally { pendingSessions.delete(id); }
}

async function createBrowserSession(id: string, signal?: AbortSignal): Promise<BrowserSession> {
	let session: BrowserSession | undefined;
	await acquireSlot();
	let context: BrowserContext | undefined;
	try {
		if (signal?.aborted) throw new Error("Browser task was stopped");
		const browser = await getSharedBrowser();
		context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, serviceWorkers: "block" });
		await routeGuard(context);
		const page = await context.newPage();
		let closed = false;
		session = {
			browser, context, page, refs: new Map(), snapshotUrl: "", lastSnapshot: "", lastUsed: Date.now(), operationCount: 0, console: [], network: [],
			close: async () => {
				if (closed) return;
				closed = true;
				sessions.delete(id);
				await context!.close();
				occupiedSlots -= 1;
				waiters.shift()?.();
				if (occupiedSlots === 0) {
					browserIdleTimer = setTimeout(() => { const current = sharedBrowser; sharedBrowser = null; void current?.then((instance) => instance.close()).catch(() => {}); }, 30_000);
					browserIdleTimer.unref?.();
				}
			},
		};
		page.on("console", (message) => { if (["error", "warning"].includes(message.type())) session!.console.push(`${message.type()}: ${message.text()}`); });
		page.on("requestfailed", (request) => session!.network.push(`FAILED ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`));
		page.on("response", (response) => session!.network.push(`${response.status()} ${response.request().method()} ${response.url()}`));
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

export async function withBrowserOp<T>(session: BrowserSession, fn: () => Promise<T>): Promise<T> {
	session.operationCount += 1;
	if (session.operationCount > 60) throw new Error("Browser action limit (60) reached for this task");
	session.lastUsed = Date.now();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([fn(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Browser operation timed out after 30 seconds")), OP_TIMEOUT_MS); })]);
	} finally { if (timer) clearTimeout(timer); }
}

export function scheduleIdleClose(session: BrowserSession, id: string): void {
	setTimeout(() => { if (Date.now() - session.lastUsed >= IDLE_CLOSE_MS) void closeBrowserSession(id); }, IDLE_CLOSE_MS).unref?.();
}
