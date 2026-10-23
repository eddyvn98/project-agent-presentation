import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const callRuntimeModel = vi.fn();
vi.mock("@/lib/project-agent/runtime/model", () => ({ callRuntimeModel: (input: unknown) => callRuntimeModel(input) }));

import { listGlobalLessons, MIN_PROJECTS, recordLessonCandidates, similarity } from "@/lib/project-agent/learning/global-lessons";
import { stemSimilarity } from "@/lib/project-agent/learning/lesson-match";
import { isWasteful, reflectOnTask } from "@/lib/project-agent/learning/reflect";
import { ANTHROPIC_FAST_SELECTOR } from "@/lib/project-agent/runtime/sub-agent-model";
import type { ProjectAgentTask } from "@/lib/project-agent/types";

const LESSON = "Lesson: list the directory before reading a file so a wrong path does not cost a step";
const wasteful = (id: string, over: Partial<ProjectAgentTask> = {}): ProjectAgentTask => ({
	id, projectId: "proj", ownerEmail: "a@b.c", prompt: "Summarise the attached plan in five bullet points for the board, keeping it neutral and short. Confidential: Acme Holdings merger", status: "done", modelSelector: "anthropic/claude-sonnet-5.5",
	createdAt: "2999-01-01T00:00:00.000Z", updatedAt: "2999-01-01T00:00:00.000Z",
	log: ["using tool sandbox_shell #a1 :: cat /work/inputs/Merger-Plan.docx", "using tool sandbox_shell #a2 :: cat /work/inputs/Merger-Plan.docx", "using tool sandbox_shell #a3 :: cat /work/inputs/Merger-Plan.docx",
		"using tool invalid_reply :: bad json: confidential budget table for jane@acme.com", "metrics :: steps=9 prompt_tokens=1000 invalid=1 tools=shell:3"],
	...over,
});
const run = (task: ProjectAgentTask, extra: { wroteLesson?: boolean } = {}) => { const lines: string[] = []; return reflectOnTask({ task, user: "u1", log: async (line) => { lines.push(line); }, ...extra }).then((lesson) => ({ lesson, lines })); };

describe("reflection on wasteful tasks", () => {
	beforeEach(() => {
		process.env.PROJECT_AGENT_LEARNING_DIR = mkdtempSync(path.join(tmpdir(), "reflect-"));
		delete process.env.PROJECT_AGENT_AUTO_REFLECT;
		callRuntimeModel.mockReset().mockResolvedValue({ answer: LESSON });
	});

	it("makes one fast-model call with a scrubbed trace and records a candidate", async () => {
		const { lesson, lines } = await run(wasteful("t1"));
		expect(callRuntimeModel).toHaveBeenCalledTimes(1);
		const call = callRuntimeModel.mock.calls[0][0];
		expect(call).toMatchObject({ user: "u1", modelSelector: ANTHROPIC_FAST_SELECTOR });
		expect(call.query).toContain("sandbox_shell > sandbox_shell > sandbox_shell");
		expect(call.query).toContain("Summarise the attached plan in five bullet points");
		for (const leak of ["Merger-Plan", "jane@acme.com", "Acme Holdings"]) expect(call.query).not.toContain(leak);
		expect(lesson).toBe(LESSON);
		const [stored] = await listGlobalLessons();
		expect(stored).toMatchObject({ text: LESSON, status: "candidate", sources: ["reflect"] });
		expect(lines).toEqual([`reflected :: ${stored.id}`]);
	});

	it("skips clean tasks, a written lesson, already reflected tasks and the disabled switch", async () => {
		await run(wasteful("t2", { log: ["using tool sandbox_shell #a :: ls", "metrics :: steps=3 prompt_tokens=10 invalid=0 tools=shell:1"] }));
		await run(wasteful("t3"), { wroteLesson: true });
		await run(wasteful("t4", { log: [...wasteful("t4").log, "reflected :: none"] }));
		process.env.PROJECT_AGENT_AUTO_REFLECT = "0";
		await run(wasteful("t5"));
		expect(callRuntimeModel).not.toHaveBeenCalled();
	});

	it("reflects once per task and records nothing for NONE or specific text", async () => {
		callRuntimeModel.mockResolvedValue({ answer: "NONE" });
		expect((await run(wasteful("t6"))).lines).toEqual(["reflected :: none"]);
		await run(wasteful("t6"));
		callRuntimeModel.mockResolvedValue({ answer: "Lesson: the fee table is in Tender.pdf page 12" });
		await run(wasteful("t7"));
		callRuntimeModel.mockRejectedValue(new Error("down"));
		expect((await run(wasteful("t8"))).lines).toEqual(["reflected :: error"]);
		expect(callRuntimeModel).toHaveBeenCalledTimes(3);
		expect(await listGlobalLessons()).toEqual([]);
	});

	it("flags failed tasks even without metrics", async () => {
		await run(wasteful("t9", { status: "failed", error: "boom", log: [] }));
		expect(callRuntimeModel).toHaveBeenCalledTimes(1);
	});
});

describe("paraphrase merging", () => {
	beforeEach(() => { process.env.PROJECT_AGENT_LEARNING_DIR = mkdtempSync(path.join(tmpdir(), "merge-")); });
	const pairs: Array<[string, string]> = [
		["Lesson: list the directory before reading a file so a wrong path does not cost a step", "Lesson: run ls on the folder first, because reading a wrong file path wastes a step"],
		["Lesson: render a page to an image to check the layout instead of guessing from the text", "Lesson: check layout by rendering pages as images rather than guessing from extracted text"],
	];
	const different: Array<[string, string]> = [
		["Lesson: list the directory before reading a file so a wrong path does not cost a step", "Lesson: render a page to an image to check the layout instead of guessing from the text"],
		["Lesson: batch several shell commands into one call to save round trips", "Lesson: search the web once with a precise query instead of fetching many pages"],
	];
	it("matches paraphrases on stems and keeps unrelated lessons apart", () => {
		for (const [a, b] of pairs) expect(Math.max(similarity(a, b), stemSimilarity(a, b))).toBeGreaterThanOrEqual(0.4);
		for (const [a, b] of different) expect(Math.max(similarity(a, b), stemSimilarity(a, b))).toBeLessThan(0.4);
	});
	it("counts distinct projects across paraphrases toward a trial", async () => {
		const [a, b] = pairs[0];
		await recordLessonCandidates([a], "p1", "note");
		await recordLessonCandidates([b], "p2", "reflect");
		await recordLessonCandidates([b], "p2", "reflect");
		expect((await listGlobalLessons())).toHaveLength(1);
		expect((await listGlobalLessons())[0].projects).toHaveLength(2);
		await recordLessonCandidates([a], "p3", "reflect");
		const [lesson] = await listGlobalLessons();
		expect(MIN_PROJECTS).toBe(3);
		expect(lesson).toMatchObject({ status: "trial", sources: ["note", "reflect"] });
	});

	it("reads real log lines that start with a timestamp", () => {
		const stamp = (line: string) => `2026-10-19T16:53:59.788Z ${line}`;
		const clean = { invalid: 0, steps: 5 };
		const metrics = stamp(`metrics :: steps=${clean.steps} prompt_tokens=10 invalid=${clean.invalid} failed=0 tools=shell:3`);
		expect(isWasteful(wasteful("ts1", { log: [1, 2, 3].map(() => stamp("using tool sandbox_shell #x :: cat /work/inputs/a.txt")).concat(metrics) }))).toBe(true);
		expect(isWasteful(wasteful("ts2", { log: [stamp("tool failed :: shell: exit 1"), stamp("tool failed :: web_fetch: HTTP 404"), metrics] }))).toBe(true);
		expect(isWasteful(wasteful("ts3", { log: [stamp("using tool sandbox_shell #x :: ls"), metrics] }))).toBe(false);
	});
});
