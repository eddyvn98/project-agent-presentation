import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDF_SCAN_TO_MD_SCRIPT } from "@/lib/project-agent/runtime/pdf-scan-script";
import { PDF_SCAN_SKILL } from "@/lib/project-agent/runtime/builtin-skill-pdf-scan";

const hasPython = (() => { try { execFileSync("python3", ["--version"]); return true; } catch { return false; } })();

describe("pdf_scan_to_md tool", () => {
	it.skipIf(!hasPython)("is valid Python", () => {
		const file = path.join(mkdtempSync(path.join(tmpdir(), "pdf-scan-")), "pdf_scan_to_md.py");
		writeFileSync(file, PDF_SCAN_TO_MD_SCRIPT);
		expect(() => execFileSync("python3", ["-m", "py_compile", file])).not.toThrow();
	});
	it("is the command the skill tells the agent to run", () => {
		expect(PDF_SCAN_SKILL.body).toContain("/work/.tools/pdf_scan_to_md.py");
		expect(PDF_SCAN_TO_MD_SCRIPT).toContain("table_pages_pending");
	});
});
