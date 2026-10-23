import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { beforeEach, describe, expect, it } from "vitest";
import { generalLesson, lessonsForTask, lessonsPrompt, listGlobalLessons, recordLessonCandidates, scoreLessonTrials, similarity } from "@/lib/project-agent/learning/global-lessons";
import type { ProjectAgentTask } from "@/lib/project-agent/types";

const LESSON = "Lesson: read the table of contents with pdftotext first, then jump to the section instead of grepping every page";
const task = (id: string, over: Partial<ProjectAgentTask>): ProjectAgentTask => ({ id, projectId: "p", ownerEmail: "a@b.c", prompt: "x", status: "done", createdAt: "2999-01-01T00:00:00.000Z", updatedAt: "2999-01-01T00:00:00.000Z", log: [], ...over });
const metrics = (steps: number, tokens: number) => `metrics :: total_s=10 steps=${steps} prompt_tokens=${tokens} invalid=0 tools=shell:1`;

describe("global lessons", () => {
	beforeEach(() => { process.env.PROJECT_AGENT_LEARNING_DIR = mkdtempSync(path.join(tmpdir(), "lessons-")); });

	it("keeps only general lessons", () => {
		expect(generalLesson(LESSON)).toBe(LESSON);
		expect(generalLesson("Lesson: check /work/library before writing a new converter script")).not.toBeNull();
		expect(generalLesson("Lesson: the fee table is in Tender.pdf page 12")).toBeNull();
		expect(generalLesson("Lesson: ask jane@acme.com for the template")).toBeNull();
		expect(generalLesson("Always cite the DOI")).toBeNull();
		expect(similarity(LESSON, "Lesson: read the table of contents with pdftotext first, then go to the section")).toBeGreaterThan(0.5);
	});

	it("goes on trial after three projects and is promoted when trial tasks do better", async () => {
		await recordLessonCandidates([LESSON], "p1");
		await recordLessonCandidates([LESSON.replace("every page", "all pages")], "p1");
		await recordLessonCandidates([LESSON], "p2");
		expect((await listGlobalLessons())[0]).toMatchObject({ status: "candidate", projects: expect.any(Array) });
		await recordLessonCandidates([LESSON], "p3");
		const [lesson] = await listGlobalLessons();
		expect(lesson.status).toBe("trial");

		const shown: string[] = [];
		for (let index = 0; shown.length < 15 || index < 200; index += 1) {
			const id = `pat_${index}`;
			const sees = (await lessonsForTask(id)).some((item) => item.id === lesson.id);
			if (sees) shown.push(id);
			await scoreLessonTrials(task(id, { log: sees ? [`learned :: ${lesson.id}`, metrics(4, 20_000)] : [metrics(8, 40_000)] }));
			if ((await listGlobalLessons())[0].status !== "trial") break;
		}
		const [decided] = await listGlobalLessons();
		expect(decided.status).toBe("active");
		expect(decided.decision).toMatch(/promoted/);
		expect(lessonsPrompt(await lessonsForTask("any"))).toContain("table of contents");
	});

	it("retires a trial lesson that makes tasks fail more", async () => {
		for (const project of ["p1", "p2", "p3"]) await recordLessonCandidates([LESSON], project);
		const [lesson] = await listGlobalLessons();
		for (let index = 0; index < 400 && (await listGlobalLessons())[0].status === "trial"; index += 1) {
			const id = `pat_${index}`;
			const sees = (await lessonsForTask(id)).some((item) => item.id === lesson.id);
			await scoreLessonTrials(task(id, sees ? { status: "failed", log: [`learned :: ${lesson.id}`, metrics(4, 20_000)] } : { log: [metrics(4, 20_000)] }));
		}
		expect((await listGlobalLessons())[0]).toMatchObject({ status: "retired" });
	});
});
