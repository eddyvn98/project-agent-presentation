import { updateProjectAgentTask } from "../task-store";

export interface WorkspaceSavedUpdate {
	boardId: string;
	/** Board changes saved by the whole task so far (sub-agents included). */
	saved: number;
	focusIds: string[];
	/** Readable (localized) lines for the commands this apply call saved. */
	summaries: string[];
}

const MAX_SUMMARIES = 40;
/** Writes the board progress onto the task so other requests (the Workspace chat stream) can read it; patches are queued so the counts never go backwards. */
export function workspaceSaveReporter(taskId: string): (update: WorkspaceSavedUpdate) => void {
	const summaries: string[] = [];
	let chain: Promise<unknown> = Promise.resolve();
	return (update) => {
		for (const line of update.summaries.map((item) => item.slice(0, 240))) if (!summaries.includes(line)) summaries.push(line);
		const patch = {
			workspaceBoardId: update.boardId,
			workspaceSaved: update.saved,
			workspaceFocusIds: update.focusIds.slice(0, 12),
			workspaceSummaries: summaries.slice(-MAX_SUMMARIES),
		};
		chain = chain.then(() => updateProjectAgentTask(taskId, patch)).catch(() => {});
	};
}
