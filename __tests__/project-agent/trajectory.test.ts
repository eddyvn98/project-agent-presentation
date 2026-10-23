import { describe, expect, it } from "vitest";
import { analyzeTrajectory, spanKey, trajectoryLine, type Span } from "@/lib/project-agent/runtime/trace";
import { harnessFindings, harnessStats } from "@/lib/project-agent/trajectory-insights";
import type { ProjectAgentTask } from "@/lib/project-agent/types";

const action = (name: string, ok: boolean, detail: string, ms = 1000): Span => ({ agent: "lead", kind: "action", name, ms, ok, step: 1, key: spanKey(name, detail) });

describe("trajectory", () => {
	it("counts retries, repeats and the first render", () => {
		const spans: Span[] = [
			{ agent: "lead", kind: "model", name: "m", ms: 3000, ok: true, step: 1, tokens: 10 },
			action("shell", false, "python a.py"), action("shell", false, "python a.py"), action("shell", true, "python a.py", 5000), action("render", true, "a.docx"),
			{ agent: "sub", kind: "action", name: "shell", ms: 9000, ok: false, step: 1 },
		];
		const result = analyzeTrajectory(spans);
		expect(result).toMatchObject({ steps: 1, actions: 4, retries: 2, repeats: 2, firstRender: 4, slowest: "shell:5s" });
		expect(trajectoryLine(result)).toContain("first_render=4");
	});
	it("turns task logs into stats and findings", () => {
		const task = (log: string[]) => ({ log } as unknown as ProjectAgentTask);
		const tasks = Array.from({ length: 5 }, () => task(["trajectory :: actions=8 retries=2 repeats=3 first_render=5 slowest=shell:9s model_pct=70", "using tool evaluator_verdict :: FAIL 1. x", "using tool policy_denied :: shell: Policy"]));
		const stats = harnessStats(tasks);
		expect(stats).toMatchObject({ traced: 5, avgRetries: 2, avgRepeats: 3, evaluatorRuns: 5, evaluatorFails: 5, policyDenied: 5 });
		expect(harnessFindings(stats).map((item) => item.title)).toEqual(expect.arrayContaining(["Agents resend identical actions", "The evaluator rejects most deliverables", "Policy denied actions"]));
	});
});
