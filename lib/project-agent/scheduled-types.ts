export type ScheduleKind = "once" | "daily" | "weekly" | "interval" | "watch";
export type ScheduleStatus = "pending" | "active" | "paused" | "completed";
export interface ScheduleSpec {
  kind: ScheduleKind;
  timezone: string;
  localTime?: string;
  weekdays?: number[];
  runAt?: string;
  everyMinutes?: number;
  url?: string;
}
export interface ScheduleRun {
  occurrence: string;
  status: "dispatching" | "queued" | "running" | "done" | "failed";
  taskId?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
  acknowledgedAt?: string;
  resultDigest?: string;
  sourceDigest?: string;
  changed?: boolean;
  summary?: string;
}
export interface ScheduledAgentTask {
  id: string;
  ownerEmail: string;
  projectId: string;
  title: string;
  prompt: string;
  spec: ScheduleSpec;
  status: ScheduleStatus;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  watchDigest?: string;
  /** Agent-requested modification that remains inactive until owner approval. */
  pendingAction?: "pause" | "resume" | "delete";
  runs: ScheduleRun[];
}
export type ScheduleCreation = Pick<ScheduledAgentTask, "projectId" | "title" | "prompt" | "spec">;
