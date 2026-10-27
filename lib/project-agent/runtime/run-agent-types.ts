import type { ProjectAgentTaskSource } from "../types";
import type { Span } from "./trace";
import type { G1GoalReceipt } from "./g1-goal-check";
import type { DirectWorkspaceState } from "./workspace-direct-apply";
import type { WorkspaceSavedUpdate } from "./workspace-task-progress";

export interface RuntimeStep { tool: string; detail: string }

export interface RuntimeInput {
	chatId: string;
	taskId?: string;
	projectId?: string;
	user: string;
	ownerEmail?: string;
	scheduledRun?: boolean;
	workflowStep?: boolean;
	engines?: string[];
	onBoard?(boardId: string): void;
	boardId?: string;
	onWorkspaceSaved?(update: WorkspaceSavedUpdate): void;
	query: string;
	userPrompt?: string;
	conversationId?: string;
	signal?: AbortSignal;
	onStep?: (step: RuntimeStep) => void;
	onConversation?(conversationId: string): void;
	onG1Receipt?(receipt: G1GoalReceipt): void;
	modelSelector?: string;
	recoverChatContext?: () => Promise<string>;
	depth?: number;
	slot?: number;
	readOnly?: boolean;
	maxSteps?: number;
	budget?: { delegates: number; waited?: { seconds: number } };
	subUsage?: { runs: number; steps: number; tokens: number; models: Set<string> };
	workspaceState?: DirectWorkspaceState;
	sources?: ProjectAgentTaskSource[];
	trace?: Span[];
	contextStats?: { captures: number; storedBytes: number; returnedBytes: number };
}
