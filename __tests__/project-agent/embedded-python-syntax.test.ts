import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDF_OCR_PY } from "@/lib/office/pdf-ocr-script";
import { PDF_CHANGES_PY } from "@/lib/office/pdf-changes-script";
import { PDF_TILE_WORKER_PY } from "@/lib/office/pdf-tile-worker-script";
import { DECK_BUILD_SCRIPT } from "@/lib/project-agent/runtime/deck-build-script";
import { INSPECT_SCRIPT } from "@/lib/project-agent/runtime/inspect-script";
import { PDF_OFFICE_CONVERT_PY } from "@/lib/project-agent/runtime/pdf-office-convert-script";
import { PDF_TOOL_EDIT_PY } from "@/lib/project-agent/runtime/pdf-tool-edit-script";
import { PDF_TOOL_EXTRA_PY } from "@/lib/project-agent/runtime/pdf-tool-extra-script";
import { PDF_TOOL_PY } from "@/lib/project-agent/runtime/pdf-tool-script";
import { RECIPES } from "@/lib/project-agent/recipes/registry";
import { RECIPE_COMMON_PY } from "@/lib/project-agent/recipes/recipe-common";
import { RECIPE_FINDER_PY } from "@/lib/project-agent/recipes/recipe-finder";
import { RENDER_SCRIPT } from "@/lib/project-agent/runtime/render-script";
import { XLSX_VALUES_SCRIPT } from "@/lib/project-agent/runtime/xlsx-values-script";

const python = (() => { try { execFileSync("python3", ["--version"]); return "python3"; } catch { return null; } })();

const SCRIPTS: Record<string, string> = {
	PDF_TOOL_PY, PDF_TOOL_EXTRA_PY, PDF_TOOL_EDIT_PY, PDF_OFFICE_CONVERT_PY, RENDER_SCRIPT, INSPECT_SCRIPT, XLSX_VALUES_SCRIPT, DECK_BUILD_SCRIPT,
	PDF_TILE_WORKER_PY, PDF_OCR_PY, PDF_CHANGES_PY, RECIPE_COMMON_PY, RECIPE_FINDER_PY,
	...Object.fromEntries(RECIPES.map((recipe) => [`recipe ${recipe.name}`, recipe.source])),
};

describe.skipIf(!python)("Python embedded in the app compiles", () => {
	for (const [name, source] of Object.entries(SCRIPTS)) {
		it(name, () => {
			const dir = mkdtempSync(path.join(os.tmpdir(), "embedded-py-"));
			try {
				const file = path.join(dir, `${name}.py`);
				writeFileSync(file, source);
				expect(() => execFileSync("python3", ["-I", "-c", "import ast,sys; ast.parse(open(sys.argv[1], encoding='utf-8').read(), sys.argv[1])", file], { stdio: "pipe" })).not.toThrow();
			} finally { rmSync(dir, { recursive: true, force: true }); }
		});
	}
});
