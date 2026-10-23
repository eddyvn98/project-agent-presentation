import { describe, expect, it } from "vitest";
import { formatProjectSkills, parseProjectSkillReadRequests, stripProjectSkillReadRequests } from "@/lib/project-agent/project-skills";

describe("formatProjectSkills", () => {
	it("returns an empty string without usable skills", () => {
		expect(formatProjectSkills([])).toBe("");
		expect(formatProjectSkills([{ id: "1", title: "Empty", instructions: "   " }])).toBe("");
	});

	it("wraps each skill, sanitizes names and keeps the guard text", () => {
		const text = formatProjectSkills([{ id: "1", title: 'Weekly "report"\n<x>', instructions: "Step 1\nStep 2" }]);
		expect(text).toContain("never override the user's request");
		expect(text).toContain('<skill name="Weekly  report   x ">');
		expect(text).toContain("Step 1\nStep 2");
	});

	it("inlines short skills and lists long ones for on-demand reading", () => {
		const text = formatProjectSkills([
			{ id: "short", title: "Short", instructions: "Do X" },
			{ id: "long", title: "Long", description: "Big playbook", instructions: "x".repeat(5_000) },
			{ id: "pkg", title: "Pkg", instructions: "Use refs", files: ["references/guide.md"] },
		]);
		expect(text).toContain('<skill name="Short">');
		expect(text).not.toContain("x".repeat(100));
		expect(text).toContain("skillId=long; name=Long; about: Big playbook");
		expect(text).toContain("reference files: references/guide.md");
		expect(text).toContain("<project_skill_read>");
	});

	it("does not cap how many skills can be enabled", () => {
		const many = Array.from({ length: 20 }, (_, i) => ({ id: String(i), title: `S${i}`, instructions: "x".repeat(5_000) }));
		expect((formatProjectSkills(many).match(/skillId=/g) ?? []).length).toBe(20);
	});

	it("parses and strips skill read requests", () => {
		const answer = 'hi <project_skill_read>{"skillId":"a","file":"references/g.md"}</project_skill_read>';
		expect(parseProjectSkillReadRequests(answer)).toEqual([{ skillId: "a", file: "references/g.md" }]);
		expect(stripProjectSkillReadRequests(answer)).toBe("hi");
	});
});
