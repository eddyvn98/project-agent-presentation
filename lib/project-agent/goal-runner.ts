import { deleteGoal, loadGoal, saveGoal, type ChatGoal } from "./goal-store";
import { goalJudgePrompt, goalTurnPrompt, parseJudge } from "./goal-prompts";
import type { ProjectAgentTask } from "./types";

export interface GoalDeps {
	judge(task: ProjectAgentTask, prompt: string): Promise<string>;
	createTask(input: { task: ProjectAgentTask; userPrompt: string; prompt: string }): Promise<ProjectAgentTask>;
	startTask(taskId: string): void;
}

const tokensOf = (task: ProjectAgentTask) => Number(task.log.findLast((line) => line.includes("metrics ::"))?.match(/prompt_tokens=(\d+)/)?.[1] ?? 0);
const keyOf = (missing: string[]) => missing.map((item) => item.toLowerCase().replace(/\W+/g, " ").trim()).sort().join("|");

/** The goal of the chat a finished task belongs to, and the key it is stored under (a new chat is filed under its first task until it has a conversation id). */
export async function goalFor(task: Pick<ProjectAgentTask, "id" | "conversationId">): Promise<{ goal: ChatGoal; key: string } | null> {
	for (const key of [task.conversationId, task.id]) {
		const goal = key ? await loadGoal(key) : null;
		if (goal && key) return { goal, key };
	}
	return null;
}

async function settle(goal: ChatGoal, key: string, task: ProjectAgentTask, patch: Partial<ChatGoal>): Promise<ChatGoal> {
	const target = task.conversationId ?? key;
	const saved = await saveGoal(target, { ...goal, ...patch });
	if (target !== key) await deleteGoal(key);
	return saved;
}

/** Called when a task of a chat with an active goal ends: check the goal, then stop (done, budget, stalled, failed) or start the next turn. */
export async function continueGoal(task: ProjectAgentTask, deps: GoalDeps): Promise<ChatGoal | null> {
	if (task.userPrompt === "/compact") return null;
	const found = await goalFor(task);
	if (!found || found.goal.status !== "active") return found?.goal ?? null;
	const { key } = found;
	const goal = { ...found.goal, turnsUsed: found.goal.turnsUsed + 1, tokensUsed: found.goal.tokensUsed + tokensOf(task) };
	if (task.status !== "done") return settle(goal, key, task, { status: task.error && /stopped by you/i.test(task.error) ? "paused" : "failed", note: task.error?.slice(0, 200) || "The last turn did not finish." });
	let verdict: ReturnType<typeof parseJudge> = null;
	try { verdict = parseJudge(await deps.judge(task, goalJudgePrompt(goal, task.resultText ?? "", (task.files ?? []).map((file) => file.name)))); } catch { /* an unreadable check never ends the goal: it is treated below */ }
	if (!verdict) return settle(goal, key, task, { status: "paused", note: "The goal check could not run; resume to try again." });
	if (verdict.done) return settle(goal, key, task, { status: "done", missing: [], note: "All requirements are met." });
	const stalledRounds = keyOf(verdict.missing) === keyOf(goal.missing) ? goal.stalledRounds + 1 : 0;
	const base = { missing: verdict.missing, stalledRounds, note: `Not done yet: ${verdict.missing.join("; ").slice(0, 300)}` };
	if (goal.turnsUsed >= goal.maxTurns) return settle(goal, key, task, { ...base, status: "budget", note: `Turn limit reached (${goal.maxTurns}). ${base.note}` });
	if (goal.tokensUsed >= goal.tokenBudget) return settle(goal, key, task, { ...base, status: "budget", note: `Token budget reached. ${base.note}` });
	if (stalledRounds >= 2) return settle(goal, key, task, { ...base, status: "stalled", note: `No progress over two checks. ${base.note}` });
	const next = { ...goal, ...base };
	const saved = await settle(next, key, task, {});
	const turn = goal.turnsUsed + 1;
	const created = await deps.createTask({ task, userPrompt: `Goal check ${goal.turnsUsed}/${goal.maxTurns}: not done yet. Continuing with: ${verdict.missing.join("; ")}`.slice(0, 600), prompt: goalTurnPrompt(next, turn) });
	deps.startTask(created.id);
	return saved;
}
