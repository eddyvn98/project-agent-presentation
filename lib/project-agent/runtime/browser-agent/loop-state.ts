/** P8 browser loop telemetry: bounded, per-task, and contains NO page data. */
export type LoopOutcome = "verified" | "unverified" | "failed" | "blocked";
export type LoopPhase = "active" | "needs_help" | "human_control" | "closed";
export interface LoopEvent {
  sequence: number; at: number; kind: "action" | "escalation" | "takeover" | "handback" | "closed";
  operation: string; outcome?: LoopOutcome;
}
export interface LoopStatus {
  phase: LoopPhase; startedAt: number; updatedAt: number; actions: number;
  verified: number; unverified: number; failed: number; blocked: number;
  interventions: number; consecutiveUnverified: number; humanWaitMs: number;
  humanStartedAt?: number; events: LoopEvent[];
}
const TTL_MS = 30 * 60_000;
const MAX_TASKS = 64, MAX_EVENTS = 16;
const ACTION_LIMIT = 48, TIME_LIMIT_MS = 12 * 60_000;
const ESCALATE_AT = 3;
const READ_ONLY = new Set(["snapshot", "console", "network", "tabs", "wait", "close",
  "screenshot", "extract", "visual_observe"]);
const OPERATIONS = new Set([
  "open", "back", "click", "type", "press", "select", "drag", "upload", "scroll",
  "download", "screenshot", "extract", "new_tab", "switch_tab", "close_tab",
  "visual_observe", "visual_click", "visual_type", ...READ_ONLY,
]);
const p8Global = globalThis as typeof globalThis & { __projectAgentP8Loop?: Map<string, LoopStatus> };
const states = p8Global.__projectAgentP8Loop ??= new Map<string, LoopStatus>();
function prune(now: number) {
  for (const [id, state] of states) if (now - state.updatedAt > TTL_MS) states.delete(id);
}
function ensure(taskId: string): LoopStatus {
  const now = Date.now();
  prune(now);
  let state = states.get(taskId);
  if (state) return state;
  if (states.size >= MAX_TASKS) {
    const oldest = [...states].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
    if (oldest) states.delete(oldest[0]);
  }
  state = { phase: "active", startedAt: now, updatedAt: now, actions: 0,
    verified: 0, unverified: 0, failed: 0, blocked: 0,
    interventions: 0, consecutiveUnverified: 0, humanWaitMs: 0, events: [] };
  states.set(taskId, state);
  return state;
}
function event(state: LoopStatus, kind: LoopEvent["kind"], operation = "", outcome?: LoopOutcome) {
  state.updatedAt = Date.now();
  state.events.push({ sequence: (state.events.at(-1)?.sequence ?? 0) + 1,
    at: state.updatedAt, kind, operation: OPERATIONS.has(operation) ? operation : "",
    ...(outcome ? { outcome } : {}) });
  if (state.events.length > MAX_EVENTS) state.events.shift();
}
export function browserLoopEnabled(): boolean {
  return process.env.PROJECT_AGENT_P8_LOOP === "1";
}
/** Called before an automated tool: hard caps are NOT reset by human handback. */
export function authorizeBrowserLoopAction(taskId: string, operation: string): string | null {
  const state = ensure(taskId);
  if (process.env.PROJECT_AGENT_P8_LOOP_REPORT_ONLY === "1") {
    if (!READ_ONLY.has(operation)) state.actions++;
    if ((state.actions >= ACTION_LIMIT || Date.now() - state.startedAt - state.humanWaitMs > TIME_LIMIT_MS) && state.phase === "active") {
      state.phase = "needs_help"; event(state, "escalation");
    }
    return null; // L1 observes but never interferes with P7 operations.
  }
  if (state.phase === "closed") return "Browser task has been closed.";
  if (state.phase === "human_control") return "Browser is controlled by the user; wait for handback.";
  if (READ_ONLY.has(operation)) return null;
  if (state.phase === "needs_help" || state.actions >= ACTION_LIMIT ||
      Date.now() - state.startedAt - state.humanWaitMs > TIME_LIMIT_MS) {
    if (state.phase !== "needs_help") { state.phase = "needs_help"; event(state, "escalation"); }
    return "Browser loop paused at its safety budget. Request human assistance or finish with verified results.";
  }
  state.actions++;
  return null;
}
export function recordBrowserLoopOutcome(taskId: string, operation: string, outcome: LoopOutcome): void {
  const state = ensure(taskId);
  if (state.phase === "closed") return;
  state[outcome]++;
  if (!READ_ONLY.has(operation)) state.consecutiveUnverified = outcome === "verified" ? 0 :
    outcome === "unverified" || outcome === "failed" ? state.consecutiveUnverified + 1 : state.consecutiveUnverified;
  event(state, "action", operation, outcome);
  if (state.consecutiveUnverified >= ESCALATE_AT && state.phase === "active") {
    state.phase = "needs_help"; event(state, "escalation");
  }
}
export function noteBrowserLoopTakeover(taskId: string): void {
  const state = ensure(taskId);
  if (state.phase !== "human_control") { state.interventions++; state.phase = "human_control";
    state.humanStartedAt = Date.now(); event(state, "takeover"); }
}
export function noteBrowserLoopHandback(taskId: string): void {
  const state = states.get(taskId);
  if (!state || state.phase !== "human_control") return;
  // Human intervention resets the no-progress streak, not the hard budget.
  state.consecutiveUnverified = 0;
  state.humanWaitMs += Math.max(0, Date.now() - (state.humanStartedAt ?? Date.now()));
  delete state.humanStartedAt;
  state.phase = state.actions >= ACTION_LIMIT || Date.now() - state.startedAt - state.humanWaitMs > TIME_LIMIT_MS
    ? "needs_help" : "active";
  event(state, "handback");
}
export function closeBrowserLoop(taskId: string): void {
  const state = states.get(taskId);
  if (state) { state.phase = "closed"; event(state, "closed"); }
}
export function browserLoopStatus(taskId: string): LoopStatus | null {
  prune(Date.now());
  const state = states.get(taskId);
  return state ? { ...state, events: state.events.map(item => ({ ...item })) } : null;
}
export function clearBrowserLoop(taskId: string): void { states.delete(taskId); }
