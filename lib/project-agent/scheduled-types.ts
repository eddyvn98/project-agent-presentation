export type ScheduleKind = "once" | "daily" | "weekly";
export type ScheduleStatus = "active" | "paused" | "completed";
export interface ScheduleSpec {
  kind: ScheduleKind;
  timezone: string;
  localTime?: string;
  weekdays?: number[];
  runAt?: string;
}
export interface ScheduleRun {
  occurrence: string;
  status: "dispatching" | "queued" | "running" | "done" | "failed";
  taskId?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
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
  runs: ScheduleRun[];
}
export type ScheduleCreation = Pick<ScheduledAgentTask, "projectId" | "title" | "prompt" | "spec">;
