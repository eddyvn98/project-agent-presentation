export type HarnessDimension = "approach" | "tools" | "delegation" | "skills";
export type HarnessStatus = "draft" | "queued" | "evaluating" | "evaluated" | "rejected" | "canary" | "active" | "retired";
export interface HarnessCaseResult {
  caseId: string; basePass: boolean; candidatePass: boolean;
  baseTokens: number; candidateTokens: number; baseMs: number; candidateMs: number;
  reason?: string;
}
export interface HarnessEvidence {
  cases: HarnessCaseResult[]; basePass: number; candidatePass: number;
  baseTokens: number; candidateTokens: number; improved: boolean;
  completedAt: string; reason: string; modelSelector?: string; baselineReference?: string;
  browserBench?: { baselinePassed: number; candidatePassed: number; count: number;
    baselineTokens: number; candidateTokens: number; passedGate: boolean };
}
export interface HarnessVariant {
  id: string; ownerEmail: string; domain: string; dimension: HarnessDimension;
  title: string; guidance: string; status: HarnessStatus;
  baselineId?: string; evidence?: HarnessEvidence; version: number;
  rolloutPercent: number; createdAt: string; updatedAt: string;
  failure?: string; rationale?: string;
}
export interface HarnessUsage {
  variantId: string; group: "trial" | "control"; taskId: string;
  ownerEmail: string; outcome: "done" | "failed"; steps: number; tokens: number;
  createdAt: string;
}
