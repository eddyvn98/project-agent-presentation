import { clearBrowserStall } from "./stall-guard";
import { noteBrowserLoopHandback } from "./loop-state";

/** Shared live browser controls; `paused` remains false for legacy API readers. */
type Control = { revision: number; touched: number; pendingActions: number; manualCount: number; manualWindow: number; listeners: Set<() => void> };
const controlGlobal = globalThis as typeof globalThis & { __projectAgentBrowserControls?: Map<string, Control> };
const active = controlGlobal.__projectAgentBrowserControls ??= new Map<string, Control>();

function get(id: string): Control {
  let entry = active.get(id);
  if (!entry) { entry = { revision: 0, touched: Date.now(), pendingActions: 0, manualCount: 0, manualWindow: Date.now(), listeners: new Set() }; active.set(id, entry); }
  return entry;
}
export function browserControlState(id: string) {
  return { paused: false, revision: get(id).revision };
}
export function touchBrowserControl(id: string) { get(id).touched = Date.now(); }

/** Invalidate the model's current plan without pausing the shared browser. */
export function notifyBrowserIntervention(id: string): void {
  const state = get(id);
  state.revision++;
  state.touched = Date.now();
  noteBrowserLoopHandback(id); // Resume legacy sessions left in the old exclusive-control phase.
  clearBrowserStall(id);
  for (const notify of state.listeners) notify();
}
/** Legacy endpoint name: takeover now means an intervention in the shared session. */
export const requestBrowserTakeover = notifyBrowserIntervention;

/** Keep the Agent from snapshotting mid-gesture or halfway through a typed phrase. */
export function beginBrowserIntervention(id: string): void {
  const state = get(id);
  if (!Number.isFinite(state.pendingActions)) state.pendingActions = 0;
  state.pendingActions++;
  notifyBrowserIntervention(id);
}
export function completeBrowserIntervention(id: string): void {
  const state = get(id);
  state.pendingActions = Math.max(0, state.pendingActions - 1);
  state.touched = Date.now();
  for (const notify of state.listeners) notify();
}

export function claimHumanBrowserAction(id: string): boolean {
  const state = get(id);
  const now = Date.now();
  if (!Number.isFinite(state.manualWindow)) state.manualWindow = now;
  if (now - state.manualWindow >= 4 * 60_000) { state.manualCount = 0; state.manualWindow = now; }
  if (state.manualCount >= 80) return false;
  state.manualCount++;
  state.touched = now;
  return true;
}
/** Legacy release is intentionally a no-op; user focus does not control Agent ownership. */
export function releaseBrowserControl(_id: string): void {}
export function clearBrowserControl(id: string): void { active.delete(id); }

export function waitForBrowserIntervention(id: string, afterRevision: number, signal?: AbortSignal): Promise<number> {
  const state = get(id);
  if (state.revision !== afterRevision) return Promise.resolve(state.revision);
  if (signal?.aborted) return Promise.reject(signal.reason ?? new Error("Task was cancelled"));
  return new Promise((resolve, reject) => {
    const cleanup = () => { state.listeners.delete(wake); signal?.removeEventListener("abort", abort); };
    const wake = () => { cleanup(); resolve(state.revision); };
    const abort = () => { cleanup(); reject(signal?.reason ?? new Error("Task was cancelled")); };
    state.listeners.add(wake);
    signal?.addEventListener("abort", abort, { once: true });
    if (state.revision !== afterRevision) wake();
  });
}

/** Kept for existing runtime callers; there is no longer an exclusive handback wait. */
export async function waitForBrowserHandoff(id: string, signal?: AbortSignal): Promise<number> {
  if (signal?.aborted) throw signal.reason ?? new Error("Task was cancelled");
  return get(id).revision;
}

/** Compatibility wait now wakes on the first user action, without a pause state. */
export function waitForBrowserTakeover(id: string, signal?: AbortSignal): Promise<void> {
  return waitForBrowserIntervention(id, get(id).revision, signal).then(() => undefined);
}

export async function waitForBrowserInterventionIdle(id: string, quietMs = 700, signal?: AbortSignal): Promise<void> {
  const state = get(id);
  while (true) {
    if (signal?.aborted) throw signal.reason ?? new Error("Task was cancelled");
    const quietFor = Date.now() - state.touched;
    if (state.pendingActions === 0 && quietFor >= quietMs) return;
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => { if (timer) clearTimeout(timer); state.listeners.delete(wake); signal?.removeEventListener("abort", abort); };
      const wake = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(signal?.reason ?? new Error("Task was cancelled")); };
      state.listeners.add(wake);
      signal?.addEventListener("abort", abort, { once: true });
      if (state.pendingActions === 0) timer = setTimeout(wake, Math.max(0, quietMs - (Date.now() - state.touched)));
      if (state.pendingActions === 0 && Date.now() - state.touched >= quietMs) wake();
    });
  }
}
