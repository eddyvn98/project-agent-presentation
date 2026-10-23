import { callRuntimeModel } from "./runtime/model";
import { subAgentSelector } from "./runtime/sub-agent-model";
import { projectAgentDifyUser } from "./dify-agent";
import { createProjectAgentTask, readProjectAgentTask } from "./task-store";
import { continueGoal, type GoalDeps } from "./goal-runner";

const live = (startTask: GoalDeps["startTask"]): GoalDeps => ({
	judge: async (task, prompt) => (await callRuntimeModel({ query: prompt, user: projectAgentDifyUser(task.ownerEmail, task.projectId), modelSelector: subAgentSelector(task.modelSelector, "other", "reviewer"), signal: AbortSignal.timeout(90_000) })).answer,
	createTask: ({ task, userPrompt, prompt }) => createProjectAgentTask({ projectId: task.projectId, ownerEmail: task.ownerEmail, projectOwnerEmail: task.projectOwnerEmail, userPrompt, prompt, conversationId: task.conversationId, modelSelector: task.modelSelector, engines: task.engines }),
	startTask,
});

/** Runs after every task: when its chat has an active goal, check it and continue. Never throws into the task runner. */
export async function afterTaskForGoal(taskId: string, startTask: GoalDeps["startTask"]): Promise<void> {
	try {
		const task = await readProjectAgentTask(taskId);
		if (task) await continueGoal(task, live(startTask));
	} catch (cause) { console.error("[project-agent] goal check failed", cause instanceof Error ? cause.message : cause); }
}
