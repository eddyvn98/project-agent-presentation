/** Separate human/agent control gate for user-opened Project browser sessions. */
type State = { pausedUntil: number; revision: number; listeners: Set<() => void> };
const globalState = globalThis as typeof globalThis & {
  __projectBrowserControl?: Map<string, State>;
};
const states = globalState.__projectBrowserControl ??= new Map<string, State>();
const TTL_MS = 5 * 60_000;
const get = (id: string): State => {
  let state = states.get(id);
  if (!state) {
    state = { pausedUntil: 0, revision: 0, listeners: new Set() };
    states.set(id, state);
  }
  return state;
};
function wake(state: State): void {
  for (const listener of [...state.listeners]) listener();
}
export function projectBrowserControl(id: string) {
  const state = get(id);
  if (state.pausedUntil && state.pausedUntil <= Date.now()) {
    state.pausedUntil = 0; state.revision++; wake(state);
  }
  return { paused: state.pausedUntil > 0, revision: state.revision };
}
export function takeProjectBrowser(id: string): void {
  const state = get(id);
  state.pausedUntil = Date.now() + TTL_MS;
  state.revision++;
  wake(state);
}
export function keepProjectBrowser(id: string): void {
  const state = get(id);
  if (projectBrowserControl(id).paused) state.pausedUntil = Date.now() + TTL_MS;
}
export function releaseProjectBrowser(id: string): void {
  const state = get(id);
  if (!state.pausedUntil) return;
  state.pausedUntil = 0;
  state.revision++;
  wake(state);
}
export function clearProjectBrowserControl(id: string): void {
  releaseProjectBrowser(id);
  states.delete(id);
}
export async function waitForProjectBrowser(id: string, signal?: AbortSignal): Promise<void> {
  const state = get(id);
  while (projectBrowserControl(id).paused) {
    if (signal?.aborted) throw signal.reason ?? new Error("Task stopped");
    await new Promise<void>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>;
      const cleanup = () => {
        clearTimeout(timeout);
        state.listeners.delete(onChange);
        signal?.removeEventListener("abort", onAbort);
      };
      const onChange = () => { cleanup(); resolve(); };
      const onAbort = () => { cleanup(); reject(signal?.reason ?? new Error("Task stopped")); };
      state.listeners.add(onChange);
      signal?.addEventListener("abort", onAbort, { once: true });
      timeout = setTimeout(onChange, Math.min(1000, Math.max(1, state.pausedUntil - Date.now())));
      if (signal?.aborted) onAbort();
      else if (!projectBrowserControl(id).paused) onChange();
    });
  }
  if (signal?.aborted) throw signal.reason ?? new Error("Task stopped");
}
