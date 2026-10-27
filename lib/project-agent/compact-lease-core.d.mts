export interface CompactScope { projectId: string; ownerEmail: string; conversationId: string }
export interface CompactClaim { id: string; token: string; epoch: number; sourceTaskId: string }
export const COMPACTION_LEASE_COLLECTION: string;
export function compactionKey(scope: CompactScope): string;
export function claimCompaction(coll: any, scope: CompactScope, sourceTaskId: string, now?: number): Promise<CompactClaim | null>;
export function finishCompaction(coll: any, claim: CompactClaim, conversationId: string, now?: number): Promise<boolean>;
export function releaseCompaction(coll: any, claim: CompactClaim): Promise<boolean>;
export function stopCompaction(coll: any, scope: CompactScope): Promise<boolean>;
