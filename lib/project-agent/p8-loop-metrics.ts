/** Parse only trusted numeric summary fields; never reuse page text or model claims. */
export interface P8LoopCounters {
  actions: number; verified: number; unverified: number;
  failed: number; blocked: number; interventions: number;
}
const FIELDS = ["actions", "verified", "unverified", "failed", "blocked", "interventions"] as const;
const EMPTY: P8LoopCounters = { actions: 0, verified: 0, unverified: 0,
  failed: 0, blocked: 0, interventions: 0 };
export function readP8LoopCounters(log: string[]): P8LoopCounters {
  const entry = log.findLast(item => item.includes("p8_loop_metrics :: ")) ?? "";
  if (!entry) return { ...EMPTY };
  const counters = { ...EMPTY };
  for (const field of FIELDS) {
    const match = entry.match(new RegExp("(?:^|\\s)" + field + "=(\\d+)(?:\\s|$)"));
    const count = Number(match?.[1] ?? 0);
    counters[field] = Number.isSafeInteger(count) ? Math.min(10_000, count) : 0;
  }
  return counters;
}
