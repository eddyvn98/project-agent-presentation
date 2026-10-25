import { canRecoverP7BrowserTask, p7SyntheticTask } from "./p7-qa-guard";

export interface P7RecoverTask {
  id: string; prompt: string; projectId: string; ownerEmail: string;
  status: string; cancelled?: boolean;
}
export type P7RecoverResult<T> =
  | { ok: true; frame: T }
  | { ok: false; reason: "task_changed" | "human_takeover" };
/** Verify again after async Chromium work; never revive Stop or overwrite takeover. */
export async function recoverP7SyntheticBrowser<T extends { hasFrame: boolean }>(args: {
  task: P7RecoverTask;
  projectId: string; owner: string;
  controlPaused: () => boolean;
  prepare: () => Promise<T>;
  readTask: () => Promise<P7RecoverTask | null>;
  markRunning: () => Promise<void>;
}): Promise<P7RecoverResult<T>> {
  const valid = (task: P7RecoverTask | null) => Boolean(task &&
    task.id === args.task.id &&
    p7SyntheticTask(task, args.projectId, args.owner) &&
    canRecoverP7BrowserTask(task));
  if (!valid(args.task)) return { ok: false, reason: "task_changed" };
  if (args.controlPaused()) return { ok: false, reason: "human_takeover" };
  const frame = await args.prepare();
  if (!frame.hasFrame) throw new Error("Synthetic browser recovery produced no frame");
  // Stop, delete and takeover can occur while Chromium is being prepared.
  const latest = await args.readTask();
  if (!valid(latest)) return { ok: false, reason: "task_changed" };
  if (args.controlPaused()) return { ok: false, reason: "human_takeover" };
  await args.markRunning();
  return { ok: true, frame };
}
