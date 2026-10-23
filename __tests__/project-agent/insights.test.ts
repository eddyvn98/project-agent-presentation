import { describe, expect, it } from "vitest";
import { buildInsights, insightsMarkdown } from "@/lib/project-agent/insights";
import type { ProjectAgentTask } from "@/lib/project-agent/types";

const task = (over: Partial<ProjectAgentTask>): ProjectAgentTask => ({ id: "pat_000000000001", projectId: "p", ownerEmail: "a@b.c", prompt: "do it", status: "done", createdAt: "2026-10-16T01:00:00.000Z", updatedAt: "2026-10-16T01:00:00.000Z", log: [], ...over });

describe("project agent insights", () => {
	it("summarises runtime metrics, groups failure causes and flags problems", () => {
		const metrics = (seconds: number, invalid: number) => [`2026-10-16T01:00:00Z metrics :: total_s=${seconds} model_s=1 action_s=1 steps=4 prompt_tokens=90000 compactions=1 invalid=${invalid} tools=shell:3,render:1`];
		const tasks = [
			task({ id: "pat_000000000001", log: metrics(300, 1) }),
			task({ id: "pat_000000000002", log: metrics(20, 0), feedback: "dislike" }),
			task({ id: "pat_000000000003", status: "failed", error: "ENOENT: no such file or directory, open '/tmp/a/b'" }),
			task({ id: "pat_000000000004", status: "failed", error: "ENOENT: no such file or directory, open '/tmp/c/d'" }),
			task({ id: "pat_000000000005", status: "failed", error: "Stopped by you." }),
		];
		const report = buildInsights(tasks);
		expect(report.outcomes).toMatchObject({ done: 2, failed: 2, stopped: 1 });
		expect(report.runtime).toMatchObject({ tasks: 2, avgSteps: 4, avgPromptTokens: 90000, invalidReplies: 1, compactions: 2, tools: { shell: 6, render: 2 } });
		expect(report.failures).toEqual([{ reason: "ENOENT: no such file or directory, open", count: 2 }]);
		expect(report.slowest[0]).toMatchObject({ taskId: "pat_000000000001", seconds: 300 });
		expect(report.findings.map((item) => item.title)).toEqual(expect.arrayContaining(["High failure rate", "Slow tail", "Large context per task", "Users disliked answers"]));
		expect(insightsMarkdown(report)).toContain("## Findings");
	});
	it("compares models from the metrics line", () => {
		const line = (model: string, seconds: number) => [`2026-10-16T01:00:00Z metrics :: total_s=${seconds} model_s=1 action_s=1 steps=4 prompt_tokens=1000 compactions=0 invalid=0 model=${model} tools=shell:1`];
		const report = buildInsights([task({ id: "pat_000000000001", log: line("openai/gpt-5.6-luna", 10) }), task({ id: "pat_000000000002", log: line("openai/gpt-5.6-luna", 30) }), task({ id: "pat_000000000003", log: line("default", 60) }), task({ id: "pat_000000000004", log: ["2026-10-16T01:00:00Z metrics :: total_s=5 steps=1 prompt_tokens=10 tools=none"] })]);
		expect(report.runtime.byModel).toEqual({ "openai/gpt-5.6-luna": { tasks: 2, avgSeconds: 20, avgSteps: 4, avgPromptTokens: 1000 }, default: { tasks: 1, avgSeconds: 60, avgSteps: 4, avgPromptTokens: 1000 } });
		expect(insightsMarkdown(report)).toContain("- openai/gpt-5.6-luna: 2 tasks, average 20s");
	});
	it("reports nothing for an empty list", () => {
		expect(buildInsights([]).findings).toEqual([]);
	});
});
