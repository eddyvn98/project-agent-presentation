import { listProjectConversationMembers } from "@/lib/capabilities/project-sharing";
import { listProjectAgentTasks } from "./task-store";

const MAX_TASKS = 8;
const MAX_TASK_CONTEXT_CHARS = 16_000;
const MAX_REQUEST_CHARS = 500;
const MAX_RESULT_CHARS = 900;

function escapeContext(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
}

export async function loadProjectAgentTaskContext(
	projectId: string,
	callerEmail: string,
	currentTaskId: string,
): Promise<string> {
	const members = await listProjectConversationMembers(projectId, callerEmail);
	if (!members) return "";
	const tasks = await listProjectAgentTasks(members, projectId, 20);
	const previous = tasks.filter((task) => task.id !== currentTaskId && task.status === "done" && task.resultText?.trim())
		.slice(0, MAX_TASKS);
	return previous.map((task) => [
		`Earlier Project Agent request: ${escapeContext(task.userPrompt ?? task.prompt).slice(0, MAX_REQUEST_CHARS)}`,
		`Recorded result: ${escapeContext(task.resultText ?? "").slice(0, MAX_RESULT_CHARS)}`,
		task.files?.length ? `Generated files: ${task.files.map((file) => escapeContext(file.name)).join(", ").slice(0, 200)}` : "",
	].filter(Boolean).join("\n")).join("\n\n---\n\n").slice(0, MAX_TASK_CONTEXT_CHARS);
}
