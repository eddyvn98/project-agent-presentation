import type { Page } from "playwright-core";

const EXPIRES_MS = 5 * 60_000;
const MAX_IMAGE_BYTES = 750_000;
const frames = new Map<string, BrowserFrame>();

interface BrowserFrame {
  watching: boolean;
  sequence: number;
  updatedAt: number;
  action: string;
  location: string;
  image?: Buffer;
  finished?: boolean;
}
export interface BrowserFrameStatus {
  watching: boolean; sequence: number; updatedAt: number;
  action: string; location: string; hasImage: boolean; finished: boolean;
}
function prune() {
  const now = Date.now();
  for (const [id, entry] of frames) if (now - entry.updatedAt > EXPIRES_MS) frames.delete(id);
}
function publicLocation(raw: string): string {
  try { const url = new URL(raw); return url.origin + url.pathname.slice(0, 180); }
  catch { return ""; }
}
/** Capturing is opt-in per task and is kept in host RAM; no cookies, DOM, or frames go to MongoDB. */
export function setBrowserWatch(taskId: string, watching: boolean) {
  prune();
  if (!watching) { frames.delete(taskId); return; }
  const previous = frames.get(taskId);
  frames.set(taskId, previous ? { ...previous, watching: true, updatedAt: Date.now() }
    : { watching: true, sequence: 0, updatedAt: Date.now(), action: "Preparing browser", location: "" });
}
export function browserWatchStatus(taskId: string): BrowserFrameStatus | null {
  prune();
  const entry = frames.get(taskId);
  return entry ? { watching: entry.watching, sequence: entry.sequence,
    updatedAt: entry.updatedAt, action: entry.action, location: entry.location,
    hasImage: Boolean(entry.image), finished: Boolean(entry.finished) } : null;
}
export function browserWatchImage(taskId: string): Buffer | null {
  prune();
  return frames.get(taskId)?.image ?? null;
}
export function finishBrowserWatch(taskId: string) {
  const entry = frames.get(taskId);
  if (entry) { entry.finished = true; entry.updatedAt = Date.now(); }
}
export async function captureBrowserWatch(taskId: string, page: Page, action: string): Promise<void> {
  const before = frames.get(taskId);
  if (!before?.watching || before.finished) return;
  try {
    // Form contents can include passwords, tokens and personally identifying input.
    // All user-editable fields are masked, even ordinary search boxes.
    const mask = page.locator('input,textarea,select,[contenteditable="true"],[data-private],[data-sensitive]');
    const screenshot = await page.screenshot({
      type: "jpeg", quality: 55, animations: "disabled",
      mask: [mask], maskColor: "#64748b", timeout: 4_000,
    });
    if (screenshot.byteLength > MAX_IMAGE_BYTES) return;
    if (frames.get(taskId) !== before || !before.watching) return; // viewer may have stopped mid-capture
    before.image = Buffer.from(screenshot);
    before.sequence += 1;
    before.location = publicLocation(page.url());
    before.action = action.slice(0, 120);
    before.updatedAt = Date.now();
  } catch { /* Visual preview must never break real browser actions. */ }
}
