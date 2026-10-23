import fs from "node:fs/promises";
import path from "node:path";
import { PDF_TOOL_PY } from "../runtime/pdf-tool-script";
import { workspaceDir } from "../runtime/sandbox";
import { RECIPE_COMMON_PY } from "./recipe-common";
import { RECIPE_COMPOSE_PY } from "./recipe-compose";
import { RECIPE_FIND_PAGES_PY } from "./recipe-find-pages";
import { RECIPE_FINDER_PY } from "./recipe-finder";
import { RECIPE_REDACT_TERMS_PY } from "./recipe-redact-terms";
import { RECIPE_REGION_TABLE_PY } from "./recipe-region-table";
import { RECIPE_SPLIT_PY } from "./recipe-split";

export interface Recipe { name: string; summary: string; tags: string[]; usage: string; example: string; limits: string; source: string }

/** Ready-made, tested scripts. Tags carry Vietnamese and English words (the finder ignores accents) so a plain request finds its recipe. */
export const RECIPES: Recipe[] = [
	{
		name: "pdf_compose", source: RECIPE_COMPOSE_PY,
		summary: "Merge, split or insert pages from several PDFs in order, then highlight words, stamp a typed signature, add page numbers or a watermark, in one run.",
		tags: ["ghep", "gop", "chen trang", "tach", "merge", "insert pages", "combine", "highlight", "to mau", "chu ky", "signature", "stamp", "dong dau", "danh so trang", "page numbers", "watermark", "hinh mo", "nhieu file", "multi file"],
		usage: 'python3 recipes/pdf_compose.py --parts "PATH:PAGES;PATH:PAGES" [--highlight WORD ...] [--highlight-pages 1-3] [--stamp TEXT] [--stamp-page last] [--page-numbers] [--watermark TEXT] [--out outputs/x.pdf]',
		example: 'python3 recipes/pdf_compose.py --parts "inputs/B.pdf:1-5;inputs/A.pdf:2-4;inputs/B.pdf:6-" --highlight "15.000.000" --highlight-pages 1-3 --stamp "Nguyễn Văn A" --out outputs/ket-qua.pdf', // vi-allow: example with Vietnamese document text
		limits: "typed (not digital) signature; highlight is exact text, so a word that is not in the text layer (scans) is reported in termsNotFound; for digital signatures, redaction or encryption use the pdf action.",
	},
	{
		name: "pdf_split", source: RECIPE_SPLIT_PY,
		summary: "Split one PDF into several files by page ranges, every N pages, or by top-level bookmarks.",
		tags: ["tach file", "chia file", "cat file", "split", "chapters", "bookmark", "muc luc", "tung phan", "moi n trang", "every n pages", "ranges"],
		usage: "python3 recipes/pdf_split.py PATH (--ranges \"1-5;6-10\" | --every N | --bookmarks) [--out-dir outputs/split]",
		example: 'python3 recipes/pdf_split.py inputs/ho-so.pdf --ranges "1-12;13-40;41-" --out-dir outputs/ho-so',
		limits: "does not rename by content; use pdf_region_table first if file names must come from title blocks.",
	},
	{
		name: "pdf_region_table", source: RECIPE_REGION_TABLE_PY,
		summary: "Read the text inside one rectangle of every page (title block, sheet number, stamp) into an Excel or CSV table, one row per page: drawing register.",
		tags: ["bang ke", "danh muc ban ve", "drawing register", "title block", "khung ten", "so hieu", "sheet number", "bang", "excel", "csv", "trich xuat", "extract", "ban ve", "drawing list", "register"],
		usage: 'python3 recipes/pdf_region_table.py PATH [--region x,y,w,h in percent] [--pages 1-50] [--out outputs/register.xlsx]',
		example: "python3 recipes/pdf_region_table.py inputs/ban-ve.pdf --region 62,84,38,16 --out outputs/danh-muc.xlsx",
		limits: "reads the text layer only (scans need OCR first); one region per run, so run again for another block.",
	},
	{
		name: "pdf_find_pages", source: RECIPE_FIND_PAGES_PY,
		summary: "Find which pages mention given words (accent-insensitive), as a page-by-term table, and optionally extract those pages into a new PDF.",
		tags: ["tim trang", "trang nao", "tim tu khoa", "find pages", "which pages", "search", "keywords", "trich trang", "extract pages", "thong ke", "count mentions"],
		usage: 'python3 recipes/pdf_find_pages.py PATH --terms "a;b;c" [--match any|all] [--table-out outputs/t.csv] [--extract-out outputs/matched.pdf]',
		example: 'python3 recipes/pdf_find_pages.py inputs/hop-dong.pdf --terms "phạt vi phạm;bảo hành" --match any --extract-out outputs/dieu-khoan.pdf', // vi-allow: example with Vietnamese document text
		limits: "text layer only; for one quick query the pdf action search op is enough.",
	},
	{
		name: "pdf_redact_terms", source: RECIPE_REDACT_TERMS_PY,
		summary: "Permanently remove words and personal data (emails, phone numbers, ID numbers) from a PDF; text and the pixels under it are deleted and the result is checked.",
		tags: ["che thong tin", "xoa thong tin", "an thong tin", "redact", "cccd", "so dien thoai", "email", "phone", "personal data", "du lieu ca nhan", "bao mat", "privacy", "anonymize"],
		usage: 'python3 recipes/pdf_redact_terms.py PATH [--terms "a;b"] [--emails] [--phones] [--vn-ids] [--regex RE] [--pages 1-5] [--out outputs/redacted.pdf]',
		example: 'python3 recipes/pdf_redact_terms.py inputs/hop-dong.pdf --emails --phones --terms "Nguyễn Văn A" --out outputs/hop-dong-an-danh.pdf', // vi-allow: example with Vietnamese document text
		limits: "cannot see text inside images (imagePagesWithoutText lists them: OCR first); vn-ids may match other long numbers, so read the report.",
	},
];

const MANIFEST = () => JSON.stringify({ recipes: RECIPES.map(({ source: _source, ...meta }) => meta) }, null, 1);

/** Every file of the recipe directory by name: the scripts, the shared helpers, the PDF engine they import, and the manifest the finder searches. */
export function recipeFiles(): Record<string, string> {
	const files: Record<string, string> = { "_common.py": RECIPE_COMMON_PY, "_pdf_tool.py": PDF_TOOL_PY, "recipes.py": RECIPE_FINDER_PY, "manifest.json": MANIFEST() };
	for (const recipe of RECIPES) files[`${recipe.name}.py`] = recipe.source;
	return files;
}

export async function writeRecipes(directory: string): Promise<void> {
	await fs.mkdir(directory, { recursive: true });
	await Promise.all(Object.entries(recipeFiles()).map(([name, body]) => fs.writeFile(path.join(directory, name), body)));
}

export const stageRecipes = (chatId: string): Promise<void> => writeRecipes(path.join(workspaceDir(chatId), "recipes"));

export const recipesPromptLine = (): string =>
	"Recipes in /work/recipes: tested ready-made scripts for common PDF jobs (merge or insert pages across files with highlight, stamp, page numbers; split; title-block tables; find pages; redact personal data). For PDF work run python3 recipes/recipes.py find <words in any language> first; if one matches the whole job, run it instead of writing your own script.";
