export type ProjectAgentTaskStatus = "queued" | "running" | "done" | "failed";

export interface ProjectAgentTaskFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  savedToProjectFileId?: string;
  savedAt?: string;
  /** Large PDF result kept in the chat board's file library instead of the 24 h task download; it stays until the board resource is deleted. */
  resource?: { boardId: string; resourceId: string };
}

export interface ProjectAgentTaskInputFile {
	id: string;
	name: string;
	mimeType: string;
	size: number;
}

export interface ProjectAgentTaskSource {
	url: string;
	title: string;
	fetchedAt: string;
	sourceType: "page" | "search";
	query?: string;
	publishedAt?: string;
}

export interface ProjectAgentTask {
  id: string;
  projectId: string;
  ownerEmail: string;
  /** Run spawned by a saved schedule; cannot modify schedules or grant new rights. */
  scheduleRunId?: string;
  idempotencyKey?: string;
  workflowRunId?: string;
  projectOwnerEmail?: string;
  /** Stable id of the chat (thread) this task belongs to; usually the first Dify conversation id. */
  conversationId?: string;
  /** Current Dify conversation behind the chat when it differs from conversationId (after a compaction). */
  difyConversationId?: string;
  /** Runtime engines (web modules) this task may use, fixed when it was created. */
  engines?: string[];
  /** Model-step selector chosen for this task; absent means the model-step app's default model. */
  modelSelector?: string;
  /** Workspace board the agent built for this chat; shown beside the conversation and editable there. */
  workspaceBoardId?: string;
  /** Workspace board this task is bound to: board commands target it instead of the chat's own board. */
  boardId?: string;
  /** Id of the Workspace chat turn that started this task (Workspace chat engine); used to find it again for retries and cancel. */
  workspaceTurnId?: string;
  /** Board changes saved so far by this task, the blocks to focus, and one line per saved command. */
  workspaceSaved?: number;
  workspaceFocusIds?: string[];
  workspaceSummaries?: string[];
  chatTitle?: string;
  chatPinned?: boolean;
  partialText?: string;
  /** Prompt tokens of the last Dify call: how full the conversation context is. */
  contextTokens?: number;
  cancelled?: boolean;
  /** Server process that is running the task, and how many times it was restarted after the server stopped. */
  bootId?: string;
  /** Messages the user added while the task was running; the agent reads them before its next step. */
  steerNotes?: string[];
  resumeCount?: number;
  feedback?: "like" | "dislike";
  userPrompt?: string;
  prompt: string;
  status: ProjectAgentTaskStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  filesExpireAt?: string;
  error?: string;
  log: string[];
  resultText?: string;
  sources?: ProjectAgentTaskSource[];
  files?: ProjectAgentTaskFile[];
	inputFiles?: ProjectAgentTaskInputFile[];
}

export interface CreateProjectAgentTaskInput {
  projectId: string;
  ownerEmail: string;
  projectOwnerEmail?: string;
  scheduleRunId?: string;
  idempotencyKey?: string;
  workflowRunId?: string;
  engines?: string[];
  /** Picker id or selector; validated when the task is created, ignored when unknown. */
  modelSelector?: string;
  userPrompt?: string;
  prompt: string;
  conversationId?: string;
  boardId?: string;
  workspaceTurnId?: string;
	/** `projectSourceId`: the bytes are copied from that Project source instead of a separate upload. */
	inputFiles?: Array<ProjectAgentTaskInputFile & { bytes?: Uint8Array; projectSourceId?: string }>;
	/** Retry of this task: its stored attachments are copied into the new task instead of being uploaded again. */
	reuseInputsFrom?: string;
}
