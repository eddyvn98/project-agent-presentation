export interface AgentWorkflowStep {
  id: string; title: string; prompt: string; requiresApproval: boolean;
  onFailure?: "stop" | "next";
  route?: { contains: string; onMatch: "next" | "stop" | string; onOther: "next" | "stop" | string };
}
export interface AgentWorkflow {
  id: string; ownerEmail: string; projectId: string; title: string; description: string;
  enabled: boolean; steps: AgentWorkflowStep[]; createdAt: string; updatedAt: string;
}
export interface AgentWorkflowRun {
  id: string; workflowId: string; ownerEmail: string; projectId: string;
  steps: AgentWorkflowStep[]; index: number;
  status: "ready" | "dispatching" | "running" | "waiting_approval" | "waiting_input" | "done" | "failed";
  taskId?: string;
  requestedInput?: string; pendingInput?: string; inputAttempt?: number;
  inputReviewRequired?: boolean;
  transitionCount?: number; previousResult?: string;
  history: Array<{ index: number; title: string; taskId?: string;
    status: "done" | "failed" | "waiting_input"; completedAt: string; error?: string }>;
  createdAt: string; updatedAt: string; error?: string;
  approvedIndex?: number; acknowledgedAt?: string;
}
