import type { Page } from "playwright-core";

const EXPIRES_MS = 5 * 60_000;
const MAX_IMAGE_BYTES = 750_000;
const MAX_HISTORY_BYTES = 4 * 1024 * 1024;
const MAX_HISTORY_STEPS = 12;
const frames = new Map<string, BrowserFrame>();

export interface BrowserClickMarker { x: number; y: number; kind: "agent" | "human" }
export interface BrowserHistoryStep {
  sequence: number; updatedAt: number; action: string; location: string;
  marker?: BrowserClickMarker;
}
interface SavedFrame extends BrowserHistoryStep { image: Buffer }
interface BrowserFrame {
  watching: boolean; sequence: number; updatedAt: number;
  action: string; location: string; finished?: boolean;
  history: SavedFrame[];
}
export interface BrowserFrameStatus {
  watching: boolean; sequence: number; updatedAt: number;
  action: string; location: string; hasImage: boolean; finished: boolean;
  history: BrowserHistoryStep[];
}
function prune() {
  const now = Date.now();
  for (const [id, entry] of frames)
    if (now - entry.updatedAt > EXPIRES_MS) frames.delete(id);
}
function publicLocation(raw: string): string {
  try { const url = new URL(raw); return url.origin + url.pathname.slice(0, 180); }
  catch { return ""; }
}
/** All images are opt-in, masked, RAM-only, and purged when watching stops. */
export function setBrowserWatch(taskId: string, watching: boolean) {
  prune();
  if (!watching) { frames.delete(taskId); return; }
  const previous = frames.get(taskId);
  frames.set(taskId, previous ? { ...previous, watching: true, updatedAt: Date.now() }
    : { watching: true, sequence: 0, updatedAt: Date.now(), action: "Preparing browser",
      location: "", history: [] });
}
export function browserWatchStatus(taskId: string): BrowserFrameStatus | null {
  prune();
  const entry = frames.get(taskId);
  return entry ? {
    watching: entry.watching, sequence: entry.sequence, updatedAt: entry.updatedAt,
    action: entry.action, location: entry.location, hasImage: entry.history.length > 0,
    finished: Boolean(entry.finished),
    history: entry.history.map(({ image: _image, ...step }) => step),
  } : null;
}
export function browserWatchImage(taskId: string, sequence?: number): Buffer | null {
  prune();
  const entry = frames.get(taskId);
  if (!entry) return null;
  const selected = sequence === undefined ? entry.history.at(-1) :
    entry.history.find((frame) => frame.sequence === sequence);
  return selected?.image ?? null;
}
export function finishBrowserWatch(taskId: string) {
  const entry = frames.get(taskId);
  if (entry) { entry.finished = true; entry.updatedAt = Date.now(); }
}
export async function captureBrowserWatch(taskId: string, page: Page, action: string,
  marker?: BrowserClickMarker): Promise<void> {
  const before = frames.get(taskId);
  if (!before?.watching || before.finished) return;
  try {
    const mask = page.locator('input,textarea,select,[contenteditable="true"],[data-private],[data-sensitive]');
    const screenshot = await page.screenshot({
      type: "jpeg", quality: 55, animations: "disabled",
      mask: [mask], maskColor: "#64748b", timeout: 4_000,
    });
    if (screenshot.byteLength > MAX_IMAGE_BYTES) return;
    if (frames.get(taskId) !== before || !before.watching || before.finished) return;
    const location = publicLocation(page.url());
    const step: SavedFrame = {
      sequence: ++before.sequence, updatedAt: Date.now(), action: action.slice(0, 120),
      location, image: Buffer.from(screenshot), ...(marker ? { marker } : {}),
    };
    before.history.push(step);
    let size = before.history.reduce((sum, item) => sum + item.image.byteLength, 0);
    while (before.history.length > MAX_HISTORY_STEPS || size > MAX_HISTORY_BYTES) {
      const removed = before.history.shift();
      size -= removed?.image.byteLength ?? 0;
    }
    before.location = location;
    before.action = step.action;
    before.updatedAt = step.updatedAt;
  } catch { /* Watch must not stop the browser agent. */ }
}
