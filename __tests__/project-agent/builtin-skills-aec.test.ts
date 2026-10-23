import { describe, expect, it } from "vitest";
import { BUILTIN_SKILLS } from "@/lib/project-agent/runtime/builtin-skills";
import { AEC_SKILLS } from "@/lib/project-agent/runtime/builtin-skills-aec";
import { runtimeTaskInstructions } from "@/lib/project-agent/runtime/instructions";

describe("AEC built-in skills", () => {
	it("registers unique skill names", () => {
		const names = BUILTIN_SKILLS.map((skill) => skill.name);
		expect(new Set(names).size).toBe(names.length);
		for (const skill of AEC_SKILLS) expect(names).toContain(skill.name);
	});

	it("keeps bodies compact", () => {
		for (const skill of AEC_SKILLS) {
			expect(skill.body.length).toBeGreaterThan(1000);
			expect(skill.body.length).toBeLessThan(6000); // skills are files read on demand, not prompt text
		}
	});

	it("lists both skills in the task instructions", () => {
		const text = runtimeTaskInstructions();
		for (const skill of AEC_SKILLS) expect(text).toContain(skill.name);
	});

	it("forbids quoting numeric values from memory", () => {
		const vietnam = AEC_SKILLS.find((skill) => skill.name === "architecture-vietnam");
		expect(vietnam?.body).toContain("NO NUMBERS FROM MEMORY");
		expect(vietnam?.body).toMatch(/web_search/);
	});
});
