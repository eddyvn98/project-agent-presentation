import { readProjectAgentTask } from "../task-store";

export const MAX_STEER_NOTES = 5;
export const MAX_STEER_CHARS = 4_000;

/** The notes the user added to this running task since the agent last looked, as one block to put in front of its next step. */
export async function takeSteerNotes(taskId: string, seen: number): Promise<{ block: string; seen: number }> {
	const task = await readProjectAgentTask(taskId).catch(() => null);
	const notes = task?.steerNotes ?? [];
	if (notes.length <= seen) return { block: "", seen };
	const fresh = notes.slice(seen);
	return { block: `The user sent ${fresh.length === 1 ? "this message" : "these messages"} while you were working. Take ${fresh.length === 1 ? "it" : "them"} into account now, change course if needed, and keep going:\n${fresh.map((note) => `> ${note.replace(/\n/g, "\n> ")}`).join("\n")}\n\n`, seen: notes.length };
}
