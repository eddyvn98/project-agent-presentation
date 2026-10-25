import { createHash } from "node:crypto";

interface FailedAttempt { fingerprint: string; count: number; touched: number }
const attempts = new Map<string, FailedAttempt>();
const TTL_MS = 5 * 60_000;
const MAX_TASKS = 64;
const MAX_IDENTICAL_FAILURES = 2;
const RETRYABLE = new Set(["click", "type", "select", "drag"]);

/** Never persist or log the page URL, DOM content or typed secret. */
function fingerprint(op: string, ref: string, url: string, snapshot: string): string {
  return createHash("sha256").update(JSON.stringify([op, ref, url, snapshot]))
    .digest("hex");
}
function recent(taskId: string): FailedAttempt | null {
  const entry = attempts.get(taskId);
  if (!entry) return null;
  if (Date.now() - entry.touched > TTL_MS) { attempts.delete(taskId); return null; }
  return entry;
}
/** Refuse only an IDENTICAL stalled DOM action; a different page/ref may proceed. */
export function browserRetryStalled(taskId: string, op: string, ref: string,
  url: string, snapshot: string): boolean {
  if (!RETRYABLE.has(op)) return false;
  const entry = recent(taskId);
  return Boolean(entry && entry.count >= MAX_IDENTICAL_FAILURES &&
    entry.fingerprint === fingerprint(op, ref, url, snapshot));
}
/** Mark retryable locator failures; a changed DOM fingerprint resets the counter. */
export function recordBrowserDomFailure(taskId: string, op: string, ref: string,
  url: string, snapshot: string): boolean {
  if (!RETRYABLE.has(op)) return false;
  const key = fingerprint(op, ref, url, snapshot);
  const prev = recent(taskId);
  attempts.delete(taskId);
  if (attempts.size >= MAX_TASKS) {
    const oldest = attempts.keys().next().value;
    if (oldest) attempts.delete(oldest);
  }
  const count = prev?.fingerprint === key ? prev.count + 1 : 1;
  attempts.set(taskId, { fingerprint: key, count, touched: Date.now() });
  return count >= MAX_IDENTICAL_FAILURES;
}
export function clearBrowserStall(taskId: string): void { attempts.delete(taskId); }
/** Public guidance cannot contain page text, credentials, or URL path. */
export const P8_STALL_GUIDANCE =
  "Repeated DOM interaction failed without page progress. Do not retry the same ref. " +
  "Request a fresh browser snapshot, choose a different control, or ask the user to take over in Browser Watch.";
