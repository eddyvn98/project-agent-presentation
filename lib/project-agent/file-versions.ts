import type { ProjectAgentTaskFile } from "./types";

export interface FileVersion<T extends { id: string }> { task: T; file: ProjectAgentTaskFile; number: number }

/** Every delivered version of a file name in a chat, oldest first, numbered v1, v2...; `tasks` are the chat's tasks in order. */
export function fileVersions<T extends { id: string; status: string; files?: ProjectAgentTaskFile[] }>(tasks: T[], name: string): Array<FileVersion<T>> {
	const versions: Array<FileVersion<T>> = [];
	for (const task of tasks) for (const file of task.files ?? []) if (file.name === name && task.status === "done") versions.push({ task, file, number: versions.length + 1 });
	return versions;
}
