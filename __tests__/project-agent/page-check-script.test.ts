import { describe, expect, it } from "vitest";
import { PAGE_CHECK_SCRIPT } from "@/lib/project-agent/runtime/page-check-script";
import { BUILTIN_SKILLS } from "@/lib/project-agent/runtime/builtin-skills";
import { runtimeTaskInstructions } from "@/lib/project-agent/runtime/instructions";

describe("page check tool", () => {
	it("is a python script that drives the sandbox chromium without a backtick", () => {
		expect(PAGE_CHECK_SCRIPT.startsWith("#!/usr/bin/env python3")).toBe(true);
		expect(PAGE_CHECK_SCRIPT).toContain("/usr/bin/chromium");
		expect(PAGE_CHECK_SCRIPT).toContain("--no-sandbox");
		expect(PAGE_CHECK_SCRIPT).not.toContain("`");
		for (const flag of ["--viewport", "--wait-text", "--full-page", "--step"]) expect(PAGE_CHECK_SCRIPT).toContain(flag);
	});

	it("has a skill that explains the command and is listed in the instructions", () => {
		const skill = BUILTIN_SKILLS.find((item) => item.name === "page-check");
		expect(skill?.body).toContain("/work/.tools/page_check.py");
		expect(skill?.body).toContain("\"action\":\"render\"");
		expect(runtimeTaskInstructions()).toContain("page-check");
	});
});
