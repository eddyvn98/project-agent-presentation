import { canRecoverP7BrowserTask, p7SyntheticTask } from "./p7-qa-guard";

export interface P7RecoverTask {
  id: string; prompt: string; projectId: string; ownerEmail: string;
  status: string; cancelled?: boolean; updatedAt?: string;
}
export type P7RecoverResult<T> =
  | { ok: true; frame: T }
  | { ok: false; reason: "task_changed" | "human_takeover" };

/** Failed recovery discards prepared browser state unless a human owns the takeover. */
export async function recoverP7SyntheticBrowser<T extends { hasFrame: boolean }>(args: {
  task: P7RecoverTask;
  projectId: string; owner: string;
  controlPaused: () => boolean;
  prepare: () => Promise<T>;
  readTask: () => Promise<P7RecoverTask | null>;
  markRunning: (latest: P7RecoverTask) => Promise<boolean>;
  cleanup: () => Promise<void>;
}): Promise<P7RecoverResult<T>> {
  const valid = (task: P7RecoverTask | null) => Boolean(task &&
    task.id === args.task.id &&
    p7SyntheticTask(task, args.projectId, args.owner) &&
    canRecoverP7BrowserTask(task));
  if (!valid(args.task)) return { ok: false, reason: "task_changed" };
  if (args.controlPaused()) return { ok: false, reason: "human_takeover" };
  let prepared = false, accepted = false;
  try {
    prepared = true; // prepare may fail after creating a Chromium session/Watch.
    const frame = await args.prepare();
    if (!frame.hasFrame) throw new Error("Synthetic browser recovery produced no frame");
    const latest = await args.readTask();
    if (!valid(latest)) return { ok: false, reason: "task_changed" };
    if (args.controlPaused()) return { ok: false, reason: "human_takeover" };
    // Atomic conditional write: a simultaneous Stop makes this return false.
    if (!await args.markRunning(latest!))
      return { ok: false, reason: args.controlPaused() ? "human_takeover" : "task_changed" };
    accepted = true;
    return { ok: true, frame };
  } finally {
    // Never close a session the human took over during Chromium preparation.
    if (prepared && !accepted && !args.controlPaused()) await args.cleanup();
  }
}

/** A second QA request must not discard the first request's live Chromium session. */
const inFlightRecoveries = new Set<string>();
export async function withP7SyntheticRecoverySlot<T>(
  taskId: string, run: () => Promise<T>,
): Promise<T | null> {
  if (inFlightRecoveries.has(taskId)) return null;
  inFlightRecoveries.add(taskId);
  try { return await run(); }
  finally { inFlightRecoveries.delete(taskId); }
}
