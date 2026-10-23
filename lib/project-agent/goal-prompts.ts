import type { ChatGoal } from "./goal-store";

export type GoalCommand = { kind: "set"; objective: string; condition?: string } | { kind: "control"; action: "pause" | "resume" | "clear" | "status" };

/** `/goal <objective> [done when: <condition>]`, or `/goal pause|resume|clear|status`. */
export function parseGoalCommand(text: string): GoalCommand | null {
	const match = text.trim().match(/^\/goal(?:\s+([\s\S]*))?$/i);
	if (!match) return null;
	const body = (match[1] ?? "").trim();
	if (/^(pause|resume|clear|status)$/i.test(body)) return { kind: "control", action: body.toLowerCase() as "pause" | "resume" | "clear" | "status" };
	if (!body) return { kind: "control", action: "status" };
	const split = body.match(/^([\s\S]*?)\s+done when:\s*([\s\S]+)$/i);
	return split ? { kind: "set", objective: split[1].trim(), condition: split[2].trim() } : { kind: "set", objective: body };
}

const AUDIT = "End your answer with a \"Goal status\" section: for every requirement of the done condition, say met (name the file, figure or page that shows it) or not met (say what is missing). Do not claim it is met without evidence. The Goal status section is bookkeeping, separate from the deliverable: it never counts toward the format or length the goal asks for.";

export function goalTurnPrompt(goal: ChatGoal, turn: number, extra?: string): string {
	return [
		`Goal (turn ${turn} of at most ${goal.maxTurns}): ${goal.objective}`,
		`Done when: ${goal.condition}`,
		turn > 1 && goal.missing.length ? `An independent check of the last turn found these still missing:\n${goal.missing.map((item, index) => `${index + 1}. ${item}`).join("\n")}\nDo the missing work now; keep what is already right.` : "Work toward the goal.",
		extra,
		AUDIT,
	].filter(Boolean).join("\n\n");
}

export function goalJudgePrompt(goal: ChatGoal, answer: string, files: string[]): string {
	return `You check whether a goal is reached. You see only the goal, the done condition and the agent's last answer (with its list of delivered files), not the work itself.\n\nGoal: ${goal.objective}\nDone when: ${goal.condition}\n\nFiles delivered this turn: ${files.length ? files.join(", ") : "none"}\n\nAgent's last answer:\n${answer.slice(0, 6000)}\n\nBe strict: a requirement counts as met only if the answer shows evidence for it. Ignore the \"Goal status\" section when judging the format or length of the deliverable itself (bullet counts, word limits). Reply with ONLY JSON: {"done": true|false, "missing": ["each requirement not yet met, short, in the language of the goal"]}`;
}

export function parseJudge(reply: string): { done: boolean; missing: string[] } | null {
	const json = reply.match(/\{[\s\S]*\}/)?.[0];
	if (!json) return null;
	try {
		const value = JSON.parse(json) as { done?: unknown; missing?: unknown };
		const missing = Array.isArray(value.missing) ? value.missing.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim().slice(0, 240)).slice(0, 8) : [];
		return { done: value.done === true && missing.length === 0, missing };
	} catch { return null; }
}
