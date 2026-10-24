export interface AgentWorkflowStep {
  id: string; title: string; prompt: string; requiresApproval: boolean;
}
export interface AgentWorkflow {
  id: string; ownerEmail: string; projectId: string; title: string; description: string;
  enabled: boolean; steps: AgentWorkflowStep[]; createdAt: string; updatedAt: string;
}
export interface AgentWorkflowRun {
  id: string; workflowId: string; ownerEmail: string; projectId: string;
  steps: AgentWorkflowStep[]; index: number;
  status: "ready" | "dispatching" | "running" | "waiting_approval" | "done" | "failed";
  taskId?: string;
  history: Array<{ index: number; title: string; taskId?: string;
    status: "done" | "failed"; completedAt: string; error?: string }>;
  createdAt: string; updatedAt: string; error?: string;
  approvedIndex?: number; acknowledgedAt?: string;
}
