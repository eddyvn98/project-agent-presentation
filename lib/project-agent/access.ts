import type { ProjectAgentTask } from "./types";

function canonicalEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function canAccessProjectAgentTask(
	task: Pick<ProjectAgentTask, "projectId" | "ownerEmail" | "projectOwnerEmail">,
	projectId: string,
	projectOwnerEmail: string,
	memberEmails: string[],
): boolean {
	if (task.projectId !== projectId) return false;
	if (task.projectOwnerEmail && canonicalEmail(task.projectOwnerEmail) !== canonicalEmail(projectOwnerEmail)) return false;
	const members = new Set(memberEmails.map(canonicalEmail));
	return members.has(canonicalEmail(task.ownerEmail));
}
