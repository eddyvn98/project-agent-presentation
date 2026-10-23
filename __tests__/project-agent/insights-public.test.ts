import { describe, expect, it } from "vitest";
import { buildPublicInsights, scrubText } from "@/lib/project-agent/insights-public";
import type { ProjectAgentTask } from "@/lib/project-agent/types";

const task = (over: Partial<ProjectAgentTask>): ProjectAgentTask => ({ id: "pat_000000000001", projectId: "p1", ownerEmail: "a@b.c", prompt: "secret brief", status: "done", createdAt: "2026-10-16T01:00:00.000Z", updatedAt: "2026-10-16T01:00:00.000Z", log: [], ...over });
const metrics = (seconds: number) => [`metrics :: total_s=${seconds} model_s=1 action_s=1 steps=4 prompt_tokens=1000 compactions=0 invalid=0 tools=shell:2`];

describe("public project agent insights", () => {
	it("scrubs emails, urls, paths, file names, quoted text and ids", () => {
		const text = scrubText("Failed for jane@acme.com at https://x.io/a on /work/inputs/Plan.pdf: \"Tower B fee\" id 3f2a9c1b-1234-5678");
		expect(text).not.toMatch(/jane|acme|x\.io|Plan|Tower|3f2a9c1b/);
		expect(text).toContain("<email>");
	});
	it("aggregates without prompts, owners or project ids", () => {
		const report = buildPublicInsights([
			task({ log: metrics(30), feedback: "dislike" }),
			task({ id: "pat_000000000002", projectId: "p2", ownerEmail: "d@e.f", createdAt: "2026-10-17T01:00:00.000Z", log: metrics(90) }),
			task({ id: "pat_000000000003", status: "failed", error: "Could not open '/work/inputs/Budget.xlsx'" }),
		]);
		const json = JSON.stringify(report);
		expect(json).not.toMatch(/secret brief|a@b\.c|d@e\.f|pat_0000|Budget/);
		expect(report).toMatchObject({ users: 2, projects: 2, dislikes: 1 });
		expect(report.daily.map((day) => day.day)).toEqual(["2026-10-16", "2026-10-17"]);
		expect(report.slowest[0]).toMatchObject({ seconds: 90, steps: 4, tools: "shell:2" });
	});
});
