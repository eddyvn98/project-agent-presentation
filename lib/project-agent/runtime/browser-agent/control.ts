import { clearBrowserStall } from "./stall-guard";
import { noteBrowserLoopHandback, noteBrowserLoopTakeover } from "./loop-state";

const HUMAN_MS = 5 * 60_000;
type Control = {
  revision: number; touched: number; paused: boolean; humanUntil: number;
  pendingActions: number; manualCount: number; manualWindow: number;
  listeners: Set<() => void>;
};
const controlGlobal = globalThis as typeof globalThis & {
  __projectAgentBrowserControls?: Map<string, Control>;
};
const active = controlGlobal.__projectAgentBrowserControls ??= new Map<string, Control>();
function wake(entry: Control) { for (const notify of entry.listeners) notify(); }
function get(id: string): Control {
  let state = active.get(id);
  if (!state) {
    state = { revision: 0, touched: Date.now(), paused: false, humanUntil: 0,
      pendingActions: 0, manualCount: 0, manualWindow: Date.now(), listeners: new Set() };
    active.set(id, state);
  }
  if (state.paused && state.humanUntil <= Date.now()) releaseBrowserControl(id);
  return state;
}
export function browserControlState(id: string) {
  const state = get(id);
  return { paused: state.paused, revision: state.revision };
}
export function touchBrowserControl(id: string) { get(id).touched = Date.now(); }
export function notifyBrowserIntervention(id: string): void {
  const state = get(id);
  state.revision++;
  state.touched = Date.now();
  clearBrowserStall(id);
  wake(state);
}
/** An exclusive local-browser takeover; shared Steel uses Mongo fencing. */
export function takeBrowserControl(id: string): void {
  const state = get(id);
  state.paused = true;
  state.humanUntil = Date.now() + HUMAN_MS;
  noteBrowserLoopTakeover(id);
  notifyBrowserIntervention(id);
}
export const requestBrowserTakeover = notifyBrowserIntervention;
export function keepBrowserControl(id: string): boolean {
  const state = get(id);
  if (!state.paused) return false;
  state.humanUntil = Date.now() + HUMAN_MS;
  return true;
}
export function releaseBrowserControl(id: string): void {
  const state = active.get(id);
  if (!state?.paused) return;
  state.paused = false;
  state.humanUntil = 0;
  noteBrowserLoopHandback(id);
  notifyBrowserIntervention(id);
}
export function beginBrowserIntervention(id: string): void {
  const state = get(id);
  state.pendingActions++;
  notifyBrowserIntervention(id);
}
export function completeBrowserIntervention(id: string): void {
  const state = get(id);
  state.pendingActions = Math.max(0, state.pendingActions - 1);
  state.touched = Date.now();
  wake(state);
}
export function claimHumanBrowserAction(id: string): boolean {
  const state = get(id);
  const now = Date.now();
  if (now - state.manualWindow >= 4 * 60_000) {
    state.manualCount = 0;
    state.manualWindow = now;
  }
  if (state.manualCount >= 80) return false;
  state.manualCount++;
  state.touched = now;
  if (state.paused) state.humanUntil = now + HUMAN_MS;
  return true;
}
export function clearBrowserControl(id: string): void {
  releaseBrowserControl(id);
  active.delete(id);
}
export function waitForBrowserIntervention(id: string, afterRevision: number,
  signal?: AbortSignal): Promise<number> {
  const state = get(id);
  if (state.revision !== afterRevision) return Promise.resolve(state.revision);
  if (signal?.aborted) return Promise.reject(signal.reason ?? new Error("Task was cancelled"));
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      state.listeners.delete(wakeListener); signal?.removeEventListener("abort", abort);
    };
    const wakeListener = () => { cleanup(); resolve(state.revision); };
    const abort = () => { cleanup(); reject(signal?.reason ?? new Error("Task was cancelled")); };
    state.listeners.add(wakeListener);
    signal?.addEventListener("abort", abort, { once: true });
    if (state.revision !== afterRevision) wakeListener();
  });
}
export async function waitForBrowserHandoff(id: string, signal?: AbortSignal): Promise<number> {
  for (;;) {
    const state = get(id);
    if (!state.paused) return state.revision;
    if (signal?.aborted) throw signal.reason ?? new Error("Task was cancelled");
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(done, Math.min(1000, Math.max(1, state.humanUntil - Date.now())));
      function cleanup() {
        clearTimeout(timer); state.listeners.delete(done);
        signal?.removeEventListener("abort", aborted);
      }
      function done() { cleanup(); resolve(); }
      function aborted() { cleanup(); reject(signal?.reason ?? new Error("Task was cancelled")); }
      state.listeners.add(done);
      signal?.addEventListener("abort", aborted, { once: true });
      if (signal?.aborted) aborted();
    });
  }
}
export function waitForBrowserTakeover(id: string, signal?: AbortSignal): Promise<void> {
  return waitForBrowserIntervention(id, get(id).revision, signal).then(() => undefined);
}
export async function waitForBrowserInterventionIdle(id: string, quietMs = 700,
  signal?: AbortSignal): Promise<void> {
  const state = get(id);
  while (true) {
    if (signal?.aborted) throw signal.reason ?? new Error("Task was cancelled");
    const quietFor = Date.now() - state.touched;
    if (state.pendingActions === 0 && quietFor >= quietMs) return;
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => { if (timer) clearTimeout(timer);
        state.listeners.delete(wakeListener); signal?.removeEventListener("abort", abort); };
      const wakeListener = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(signal?.reason ?? new Error("Task was cancelled")); };
      state.listeners.add(wakeListener);
      signal?.addEventListener("abort", abort, { once: true });
      if (state.pendingActions === 0)
        timer = setTimeout(wakeListener, Math.max(0, quietMs - (Date.now() - state.touched)));
      if (state.pendingActions === 0 && Date.now() - state.touched >= quietMs) wakeListener();
    });
  }
}
