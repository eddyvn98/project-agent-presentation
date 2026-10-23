import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type GoalStatus = "active" | "paused" | "done" | "budget" | "stalled" | "failed";

export interface ChatGoal {
	projectId: string;
	ownerEmail: string;
	objective: string;
	condition: string;
	status: GoalStatus;
	maxTurns: number;
	turnsUsed: number;
	tokenBudget: number;
	tokensUsed: number;
	missing: string[];
	stalledRounds: number;
	/** Why the goal is not active any more, or what the last check found. */
	note?: string;
	createdAt: string;
	updatedAt: string;
}

const DIR = path.join(process.cwd(), "data", "project-agent", "goals");
const fileOf = (chatKey: string) => path.join(DIR, `${createHash("sha1").update(chatKey).digest("hex").slice(0, 20)}.json`);

export function goalLimits(): { maxTurns: number; tokenBudget: number } {
	const turns = Number(process.env.PROJECT_AGENT_GOAL_MAX_TURNS), tokens = Number(process.env.PROJECT_AGENT_GOAL_TOKEN_BUDGET);
	return { maxTurns: Math.min(Math.max(Math.round(turns) || 5, 1), 10), tokenBudget: Math.max(Math.round(tokens) || 1_500_000, 100_000) };
}

/** A goal belongs to a chat; before a new chat has a conversation id it is filed under its first task's id. */
export async function loadGoal(chatKey: string): Promise<ChatGoal | null> {
	try { return JSON.parse(await fs.readFile(fileOf(chatKey), "utf-8")) as ChatGoal; } catch { return null; }
}

export async function saveGoal(chatKey: string, goal: ChatGoal): Promise<ChatGoal> {
	await fs.mkdir(DIR, { recursive: true });
	const next = { ...goal, updatedAt: new Date().toISOString() };
	const target = fileOf(chatKey);
	const temporary = `${target}.${process.pid}.tmp`;
	await fs.writeFile(temporary, JSON.stringify(next));
	await fs.rename(temporary, target);
	return next;
}

export async function deleteGoal(chatKey: string): Promise<void> {
	await fs.rm(fileOf(chatKey), { force: true });
}

export function newGoal(input: { projectId: string; ownerEmail: string; objective: string; condition?: string; maxTurns?: number }): ChatGoal {
	const limits = goalLimits();
	const now = new Date().toISOString();
	return {
		projectId: input.projectId, ownerEmail: input.ownerEmail, objective: input.objective.trim().slice(0, 2000), condition: (input.condition?.trim() || input.objective.trim()).slice(0, 2000),
		status: "active", maxTurns: Math.min(Math.max(Math.round(input.maxTurns ?? 0) || limits.maxTurns, 1), 10), turnsUsed: 0, tokenBudget: limits.tokenBudget, tokensUsed: 0, missing: [], stalledRounds: 0, createdAt: now, updatedAt: now,
	};
}
