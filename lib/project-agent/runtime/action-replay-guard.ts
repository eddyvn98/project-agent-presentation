import { createHash } from "node:crypto";

/** In-memory, per-run loop detection. Never store tool output or credentials. */
interface Observation { action: string; digest: string }
const digest = (value: string) => createHash("sha256")
  .update(value.trim().replace(/\s+/g, " ").slice(0, 2000)).digest("hex").slice(0, 16);
export class ActionReplayGuard {
  private recent: Observation[] = [];
  private attemptedEffects = new Set<string>();
  private progressOnly = 0;
  /** Blocks exact replays before the next external mutation can occur. */
  before(action: string, key: string, effectful = false): string | null {
    if (effectful && this.attemptedEffects.has(key))
      return "Identical external action was already attempted in this run. Inspect its outcome instead of replaying it.";
    if (action === "progress" && this.progressOnly >= 3)
      return "Only progress messages were generated without executing useful work.";
    const tail = this.recent;
    if (tail.length >= 3 && tail.slice(-3).every(item => item.action === key &&
      item.digest === tail[tail.length - 1].digest))
      return "The same action produced the same result three times; another replay was stopped.";
    if (tail.length >= 6) {
      const last = tail.slice(-6);
      const alternating = last.every((item, index) =>
        item.action === last[index % 2].action && item.digest === last[index % 2].digest);
      if (alternating && last[0].action === key)
        return "An unchanged two-action cycle was detected and stopped.";
    }
    return null;
  }
  /** Records the attempt, even if the result fails; effectful operations may have completed remotely. */
  record(action: string, key: string, output: string, effectful = false): void {
    if (effectful) this.attemptedEffects.add(key);
    this.progressOnly = action === "progress" ? this.progressOnly + 1 : 0;
    this.recent.push({ action: key, digest: digest(output) });
    if (this.recent.length > 12) this.recent.shift();
  }
}
export function mayHaveExternalEffects(action: { action: string; op?: string }): boolean {
  if (action.action === "workspace_apply" || action.action === "generate_image") return true;
  if (action.action === "schedule" || action.action === "workflow") return action.op !== "list";
  // Browser clicks are not always irreversible, so use result-sensitive cycle detection.
  return false;
}
