export interface CheckpointScope { projectId: string; chatId: string }
export interface CheckpointEvent {
  taskId: string; step: number; action: string; failed: boolean;
  observation: string; at?: string;
}
export const CHECKPOINT_COLLECTION: string;
export function checkpointScopeKey(scope: CheckpointScope): string;
export function appendSharedCheckpoint(
  collection: any, scope: CheckpointScope, event: CheckpointEvent, now?: Date,
): Promise<CheckpointEvent>;
export function listSharedCheckpoints(
  collection: any, scope: CheckpointScope, taskId?: string, now?: Date,
): Promise<CheckpointEvent[]>;
export function deleteSharedCheckpoints(
  collection: any, scope: CheckpointScope,
): Promise<boolean>;
