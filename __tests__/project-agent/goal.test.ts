import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseGoalCommand, parseJudge } from "@/lib/project-agent/goal-prompts";
import type { ProjectAgentTask } from "@/lib/project-agent/types";

let cwd = "";
const task = (patch: Partial<ProjectAgentTask> = {}) => ({ id: "pat_1", projectId: "p", ownerEmail: "a@b.c", status: "done", resultText: "answer", files: [], log: ["metrics :: total_s=1 prompt_tokens=1000"], conversationId: "conv-1", userPrompt: "x", ...patch }) as unknown as ProjectAgentTask;

describe("goal command and judge parsing", () => {
	it("parses /goal forms", () => {
		expect(parseGoalCommand("/goal Finish the BOQ done when: totals match the drawings")).toEqual({ kind: "set", objective: "Finish the BOQ", condition: "totals match the drawings" });
		expect(parseGoalCommand("/goal Write the memo")).toEqual({ kind: "set", objective: "Write the memo" });
		expect(parseGoalCommand("/goal pause")).toEqual({ kind: "control", action: "pause" });
		expect(parseGoalCommand("/goal")).toEqual({ kind: "control", action: "status" });
		expect(parseGoalCommand("goal something")).toBeNull();
	});
	it("reads the judge verdict and refuses done with missing items", () => {
		expect(parseJudge('{"done": true, "missing": []}')).toEqual({ done: true, missing: [] });
		expect(parseJudge('Sure: {"done": true, "missing": ["totals"]}')).toEqual({ done: false, missing: ["totals"] });
		expect(parseJudge("no json")).toBeNull();
	});
});

describe("goal continuation", () => {
	beforeAll(async () => { cwd = process.cwd(); const dir = await fs.mkdtemp(path.join(os.tmpdir(), "goal-")); vi.spyOn(process, "cwd").mockReturnValue(dir); });
	afterAll(() => vi.restoreAllMocks());
	beforeEach(async () => { const { deleteGoal } = await import("@/lib/project-agent/goal-store"); await deleteGoal("conv-1"); await deleteGoal("pat_1"); });

	async function start(objective = "Make the deck", overrides: Record<string, unknown> = {}) {
		const store = await import("@/lib/project-agent/goal-store");
		await store.deleteGoal("conv-1");
		const goal = { ...store.newGoal({ projectId: "p", ownerEmail: "a@b.c", objective }), ...overrides };
		await store.saveGoal("pat_1", goal);
		return store;
	}
	const deps = (reply: string) => ({ judge: vi.fn().mockResolvedValue(reply), createTask: vi.fn().mockResolvedValue({ id: "pat_2" } as ProjectAgentTask), startTask: vi.fn() });

	it("starts the next turn with the missing items and refiles the goal under the conversation", async () => {
		const store = await start();
		const d = deps('{"done": false, "missing": ["Slide 3 has no chart"]}');
		const { continueGoal } = await import("@/lib/project-agent/goal-runner");
		const result = await continueGoal(task({ conversationId: "conv-1" }), d);
		expect(result).toMatchObject({ status: "active", turnsUsed: 1, tokensUsed: 1000, missing: ["Slide 3 has no chart"] });
		expect(d.createTask.mock.calls[0][0].prompt).toContain("Slide 3 has no chart");
		expect(d.startTask).toHaveBeenCalledWith("pat_2");
		expect(await store.loadGoal("conv-1")).not.toBeNull();
		expect(await store.loadGoal("pat_1")).toBeNull();
	});
	it("stops when done, at the turn limit, when stalled, or when a turn fails", async () => {
		const { continueGoal } = await import("@/lib/project-agent/goal-runner");
		await start(); let d = deps('{"done": true, "missing": []}');
		expect((await continueGoal(task(), d))?.status).toBe("done"); expect(d.startTask).not.toHaveBeenCalled();
		await start("g", { turnsUsed: 4, maxTurns: 5 }); d = deps('{"done": false, "missing": ["x"]}');
		expect((await continueGoal(task(), d))?.status).toBe("budget");
		await start("g", { missing: ["x"], stalledRounds: 1 }); d = deps('{"done": false, "missing": ["X"]}');
		expect((await continueGoal(task(), d))?.status).toBe("stalled");
		await start("g"); d = deps("");
		expect((await continueGoal(task({ status: "failed", error: "boom" }), d))?.status).toBe("failed"); expect(d.judge).not.toHaveBeenCalled();
		await start("g"); expect((await continueGoal(task({ status: "failed", error: "Task stopped by you" }), deps("")))?.status).toBe("paused");
	});
	it("ignores paused goals and compaction entries, and pauses when the check cannot run", async () => {
		const { continueGoal } = await import("@/lib/project-agent/goal-runner");
		await start("g", { status: "paused" }); const d = deps('{"done": true, "missing": []}');
		expect((await continueGoal(task(), d))?.status).toBe("paused"); expect(d.judge).not.toHaveBeenCalled();
		await start("g"); expect(await continueGoal(task({ userPrompt: "/compact" }), d)).toBeNull();
		await start("g"); expect((await continueGoal(task(), deps("not json")))?.status).toBe("paused");
	});
});
