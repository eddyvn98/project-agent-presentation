import type { PublicProjectAgentTask } from "./public-task";

export interface ProjectAgentConversation {
	id: string;
	conversationId?: string;
	tasks: PublicProjectAgentTask[];
	title: string;
	pinned: boolean;
}

export function groupProjectAgentTasks(tasks: PublicProjectAgentTask[]): ProjectAgentConversation[] {
	const groups = new Map<string, ProjectAgentConversation>();
	for (const task of tasks) {
		const id = task.conversationId ? `conversation:${task.conversationId}` : `task:${task.id}`;
		const group = groups.get(id) ?? {
			id,
			conversationId: task.conversationId,
			tasks: [],
			title: "",
			pinned: false,
		};
		group.tasks.push(task);
		groups.set(id, group);
	}
	return [...groups.values()]
		.map((group) => {
			const sorted = group.tasks.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
			const titled = [...sorted].reverse().find((task) => task.chatTitle);
			const firstLine = (sorted[0].userPrompt ?? sorted[0].prompt).split(/\r?\n/, 1)[0].replace(/\s+/g, " ").trim();
			return {
				...group,
				tasks: sorted,
				title: titled?.chatTitle ?? (firstLine.length > 96 ? `${firstLine.slice(0, 93).trimEnd()}…` : firstLine),
				pinned: sorted.some((task) => task.chatPinned),
			};
		})
		.sort((left, right) => Number(right.pinned) - Number(left.pinned)
			|| Date.parse(right.tasks.at(-1)!.createdAt) - Date.parse(left.tasks.at(-1)!.createdAt));
}
