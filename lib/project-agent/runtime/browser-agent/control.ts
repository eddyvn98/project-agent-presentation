import { browserLoopEnabled, noteBrowserLoopHandback, noteBrowserLoopTakeover } from "./loop-state";
import { clearBrowserStall } from "./stall-guard";
/** Host-process user takeover gate. Only the initiating task owner can change it via the authenticated route. */
type Control = { paused: boolean; revision: number; touched: number; manualCount: number; listeners: Set<() => void> };
const active = new Map<string, Control>();
const EXPIRY_MS = 4 * 60_000;

function get(id: string): Control {
  let entry = active.get(id);
  if (!entry) { entry = { paused: false, revision: 0, touched: Date.now(), manualCount: 0, listeners: new Set() }; active.set(id, entry); }
  if (entry.paused && Date.now() - entry.touched >= EXPIRY_MS) releaseBrowserControl(id);
  return entry;
}
export function browserControlState(id: string) {
  const state = get(id);
  return { paused: state.paused, revision: state.revision };
}
export function touchBrowserControl(id: string) { const state = get(id); if (state.paused) state.touched = Date.now(); }
export function requestBrowserTakeover(id: string): void {
  const state = get(id);
  if (!state.paused && browserLoopEnabled()) noteBrowserLoopTakeover(id);
  state.paused = true; state.manualCount = 0; state.touched = Date.now();
}
export function claimHumanBrowserAction(id: string): boolean {
  const state = get(id);
  if (!state.paused || state.manualCount >= 80) return false;
  state.manualCount++; state.touched = Date.now(); return true;
}
export function releaseBrowserControl(id: string): void {
  const state = active.get(id);
  if (!state) return;
  if (state.paused) { state.paused = false; state.revision++;
    clearBrowserStall(id); // Human changed the page; old locator failure evidence is stale.
    if (browserLoopEnabled()) noteBrowserLoopHandback(id); }
  state.touched = Date.now();
  for (const notify of state.listeners) notify();
}
export function clearBrowserControl(id: string): void {
  releaseBrowserControl(id);
  active.delete(id);
}
/** Do not let stale model actions run after a human touched the same browser. */
export async function waitForBrowserHandoff(id: string, signal?: AbortSignal): Promise<number> {
  const state = get(id);
  while (state.paused) {
    if (signal?.aborted) throw signal.reason ?? new Error("Task was cancelled");
    if (Date.now() - state.touched >= EXPIRY_MS) { releaseBrowserControl(id); break; }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); resolve(); }, 1_000);
      const abort = () => { cleanup(); reject(signal?.reason ?? new Error("Task was cancelled")); };
      const wake = () => { cleanup(); resolve(); };
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); state.listeners.delete(wake); };
      signal?.addEventListener("abort", abort, { once: true });
      state.listeners.add(wake);
    });
  }
  return state.revision;
}
