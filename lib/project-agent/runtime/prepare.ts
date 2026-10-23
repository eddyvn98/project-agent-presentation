import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { BUILTIN_SKILLS } from "./builtin-skills";
import { recipesPromptLine, stageRecipes } from "../recipes/registry";
import { INSPECT_SCRIPT } from "./inspect-script";
import { DECK_BUILD_SCRIPT } from "./deck-build-script";
import { XLSX_VALUES_SCRIPT } from "./xlsx-values-script";
import { syncLibraryIn } from "./library";
import { PDF_SCAN_TO_MD_SCRIPT } from "./pdf-scan-script";
import { PAGE_CHECK_SCRIPT } from "./page-check-script";
import { WEBKIT_SCRIPT } from "./webkit-script";
import { IFC_SUMMARY_SCRIPT } from "./ifc-summary-script";
import { PLACES_SCRIPT } from "./places-script";
import { ANNOTATE_SCRIPT } from "./annotate-script";
import { REF_IMAGE_SCRIPT } from "./ref-image-script";
import { execInSandbox, workspaceDir } from "./sandbox";

const CACHE_DIR = path.join(process.cwd(), "data", "project-agent", "cache");
const CACHE_LIMIT = 300;

/** The structure summary depends only on the staged bytes and names, so the same files in a later chat reuse it instead of running python in the sandbox. */
async function cachedSummary(chatId: string, staged: string[], compute: () => Promise<string>): Promise<string> {
	const hash = createHash("sha256").update(INSPECT_SCRIPT);
	for (const name of [...staged].sort()) hash.update(name).update(await fs.readFile(path.join(workspaceDir(chatId), "inputs", name)).catch(() => Buffer.from("?")));
	const file = path.join(CACHE_DIR, `summary-${hash.digest("hex").slice(0, 32)}.txt`);
	const hit = await fs.readFile(file, "utf8").catch(() => "");
	if (hit) return hit;
	const text = await compute();
	if (text) {
		await fs.mkdir(CACHE_DIR, { recursive: true });
		await fs.writeFile(file, text);
		const entries = await fs.readdir(CACHE_DIR);
		if (entries.length > CACHE_LIMIT) {
			const stats = await Promise.all(entries.map(async (entry) => ({ entry, mtime: (await fs.stat(path.join(CACHE_DIR, entry)).catch(() => null))?.mtimeMs ?? 0 })));
			for (const { entry } of stats.sort((a, b) => a.mtime - b.mtime).slice(0, entries.length - CACHE_LIMIT)) await fs.rm(path.join(CACHE_DIR, entry), { force: true });
		}
	}
	return text;
}

/** What the agent is told up front: the structure of the staged files and the project's reusable scripts. */
export async function describeWorkspace(projectId: string, chatId: string, staged: string[]): Promise<string> {
	const tools = path.join(workspaceDir(chatId), ".tools");
	await fs.mkdir(tools, { recursive: true });
	const parts: string[] = [];
	await fs.writeFile(path.join(tools, "deck_build.py"), DECK_BUILD_SCRIPT);
	await fs.writeFile(path.join(tools, "xlsx_values.py"), XLSX_VALUES_SCRIPT);
	await fs.writeFile(path.join(tools, "pdf_scan_to_md.py"), PDF_SCAN_TO_MD_SCRIPT);
	await fs.writeFile(path.join(tools, "page_check.py"), PAGE_CHECK_SCRIPT);
	await fs.writeFile(path.join(tools, "webkit.py"), WEBKIT_SCRIPT);
	await fs.writeFile(path.join(tools, "ifc_summary.py"), IFC_SUMMARY_SCRIPT);
	await fs.writeFile(path.join(tools, "places.py"), PLACES_SCRIPT);
	await fs.writeFile(path.join(tools, "annotate.py"), ANNOTATE_SCRIPT);
	await fs.writeFile(path.join(tools, "refimage.py"), REF_IMAGE_SCRIPT);
	parts.push("Office deck builder installed at /work/.tools/deck_build.py (read the deck-design skill before using it). Scanned-PDF converter installed at /work/.tools/pdf_scan_to_md.py (read the pdf-scan-to-markdown skill before OCR work). Headless-browser page checker at /work/.tools/page_check.py (read the page-check skill after you build or change any web page). Offline web libraries, fonts, icons and the one-file packer at /work/.tools/webkit.py (read the web-build-kit skill before coding any web page). IFC model reader at /work/.tools/ifc_summary.py (ifc-bim-read skill). Place lookups (geocode, distance, nearby schools and markets) at /work/.tools/places.py (local-business-research skill). Photo markup (numbered markers and boxes with a legend) at /work/.tools/annotate.py and a reference picture from a public web page at /work/.tools/refimage.py (visual-references skill; advisory-answer skill for advice requests).");
	if (staged.some((name) => /\.(jpe?g|png|webp|gif)$/i.test(name))) {
		parts.push("When advice or recommendations rely on visible details in the user's attached photos, read /work/skills/visual-references.md and follow it: create a marked-up copy of the relevant photo and place it beside the advice that uses it; add a public reference image when it materially clarifies what to copy. If images do not help answer this request, omit them.");
	}
	if (staged.length) {
		await fs.writeFile(path.join(tools, "input_summary_tool.py"), INSPECT_SCRIPT);
		const summary = await cachedSummary(chatId, staged, async () => { const run = await execInSandbox(chatId, "python3 /work/.tools/input_summary_tool.py", 60).catch(() => null); return run && run.exitCode === 0 ? run.output.trim() : ""; });
		if (summary) parts.push(`Structure of the staged files (precomputed, do not probe it again):\n${summary}`);
	}
	const skills = path.join(workspaceDir(chatId), "skills");
	await fs.mkdir(skills, { recursive: true });
	for (const skill of BUILTIN_SKILLS) await fs.writeFile(path.join(skills, `${skill.name}.md`), `# ${skill.name}\n\n${skill.body}\n`);
	parts.push(`Skills in /work/skills (read with cat before the matching work): ${BUILTIN_SKILLS.map((skill) => `${skill.name} (${skill.description})`).join("; ")}`);
	await stageRecipes(chatId);
	parts.push(recipesPromptLine());
	const library = await syncLibraryIn(projectId, chatId).catch(() => "");
	if (library) parts.push(`Reusable scripts saved by earlier tasks (this project's library in /work/library; read one before rewriting similar code and check it fits; if it does not, improve it under the same name or write a new one under a new name):\n${library}`);
	return parts.join("\n\n");
}
