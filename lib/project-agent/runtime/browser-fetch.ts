import { launchChromium, type Browser } from "./browser-launcher";
import { guardedRequest } from "./guarded-fetch";

const MAX_PAGES = 2;
const PAGE_TIMEOUT_MS = 20_000;
const IDLE_CLOSE_MS = 30_000;
const MAX_HTML_CHARS = 3 * 1024 * 1024;
const MAX_RESOURCE_BYTES = 5 * 1024 * 1024;
const SKIPPED_TYPES = new Set(["image", "media", "font"]);
let browserPromise: Promise<Browser> | null = null;
let activePages = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const pageWaiters: Array<() => void> = [];

async function sharedBrowser(): Promise<Browser> {
	if (idleTimer) clearTimeout(idleTimer);
	if (!browserPromise) {
		const launching = launchChromium();
		browserPromise = launching.catch((error) => { browserPromise = null; throw error; });
		// A crashed browser must not stay cached for the next page.
		void launching.then((browser) => browser.on("disconnected", () => { if (browserPromise === launching) browserPromise = null; })).catch(() => {});
	}
	return browserPromise;
}

async function acquirePageSlot(): Promise<() => void> {
	if (activePages < MAX_PAGES) activePages += 1;
	else await new Promise<void>((resolve) => pageWaiters.push(resolve));
	let released = false;
	return () => {
		if (released) return;
		released = true;
		const next = pageWaiters.shift();
		if (next) next();
		else {
			activePages -= 1;
			if (activePages === 0) {
				idleTimer = setTimeout(() => {
					const current = browserPromise;
					browserPromise = null;
					idleTimer = undefined;
					void current?.then((browser) => browser.close()).catch(() => {});
				}, IDLE_CLOSE_MS);
				idleTimer.unref?.();
			}
		}
	};
}

/** Renders a JavaScript page in a shared, bounded headless browser; failure means the caller should use static HTML. */
export async function renderPublicPage(rawUrl: string, signal?: AbortSignal): Promise<{ html: string; title: string } | null> {
	const release = await acquirePageSlot();
	let context: Awaited<ReturnType<Browser["newContext"]>> | undefined;
	let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
	try {
		const browser = await sharedBrowser();
		context = await browser.newContext({ acceptDownloads: false, serviceWorkers: "block" });
		await context.routeWebSocket(/.*/, (socket) => { void socket.close(); });
		const page = await context.newPage();
		timeoutTimer = setTimeout(() => { void page.close().catch(() => {}); }, PAGE_TIMEOUT_MS);
		context.on("page", (popup) => { if (popup !== page) void popup.close().catch(() => {}); });
		page.on("download", (download) => { void download.cancel().catch(() => {}); });
		await context.route("**/*", async (route) => {
			if (signal?.aborted) { await route.abort("aborted").catch(() => {}); return; }
			const request = route.request();
			if (SKIPPED_TYPES.has(request.resourceType())) { await route.abort("blockedbyclient").catch(() => {}); return; }
			try {
				// Fetched here over a connection pinned to the checked address, so DNS rebinding cannot reach a private host.
				const { ["content-length"]: _length, host: _host, ...headers } = await request.allHeaders();
				const response = await guardedRequest(request.url(), {
					method: request.method(), headers, body: request.postDataBuffer() ?? undefined, signal, maxBytes: MAX_RESOURCE_BYTES, timeoutMs: PAGE_TIMEOUT_MS,
				});
				await route.fulfill({ status: response.status, headers: response.headers, body: response.body });
			} catch { await route.abort("blockedbyclient").catch(() => {}); }
		});
		await page.goto(rawUrl, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });
		if (signal?.aborted) return null;
		await page.waitForTimeout(1_000);
		const [html, title] = await Promise.all([page.content(), page.title()]);
		return { html: html.slice(0, MAX_HTML_CHARS), title };
	} catch { return null; }
	finally {
		if (timeoutTimer) clearTimeout(timeoutTimer);
		if (context) await new Promise<void>((resolve) => {
			const timer = setTimeout(resolve, 1_000);
			void context!.close().catch(() => {}).finally(() => { clearTimeout(timer); resolve(); });
		});
		release();
	}
}
