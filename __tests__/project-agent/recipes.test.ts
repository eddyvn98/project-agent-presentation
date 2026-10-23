import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RECIPES, writeRecipes } from "@/lib/project-agent/recipes/registry";

const sh = (cmd: string[], cwd: string) => execFileSync(cmd[0], cmd.slice(1), { cwd, encoding: "utf8", stdio: "pipe" });
const hasEngine = (() => { try { execFileSync("python3", ["-c", "import PIL\ntry:\n import pymupdf\nexcept ImportError:\n import fitz"], { stdio: "pipe" }); return true; } catch { return false; } })();

let dir = "";
const run = (script: string, ...args: string[]) => JSON.parse(sh(["python3", `recipes/${script}.py`, ...args], dir).trim().split("\n").at(-1)!);
const py = (code: string) => sh(["python3", "-c", `try:\n import pymupdf as fitz\nexcept ImportError:\n import fitz\n${code}`], dir).trim();

beforeAll(async () => {
	dir = mkdtempSync(path.join(os.tmpdir(), "recipes-"));
	await writeRecipes(path.join(dir, "recipes"));
	if (!hasEngine) return;
	py(`import os
os.makedirs("inputs")
for name, count, label in (("A", 6, "Ho so A"), ("B", 12, "Ho so B")):
    d = fitz.open()
    for i in range(count):
        p = d.new_page()
        p.insert_text((72, 100), "%s - Trang %d" % (label, i + 1), fontsize=20)
        p.insert_text((72, 140), "Dien tich san 1200 m2, don gia 15.000.000 dong. Lien he a.b@example.com hoac 0912 345 678", fontsize=10)
        p.insert_text((430, 800), "BV-%02d Mat bang tang %d" % (i + 1, i + 1), fontsize=9)
    if name == "A":
        d.set_toc([[1, "Phan mot", 1], [1, "Phan hai", 4]])
    d.save("inputs/%s.pdf" % name)`);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("recipe finder", () => {
	it("lists every recipe and each has the fields an agent needs", () => {
		const listed = sh(["python3", "recipes/recipes.py", "list"], dir);
		for (const recipe of RECIPES) {
			expect(listed).toContain(recipe.name);
			expect(recipe.usage).toContain(`recipes/${recipe.name}.py`);
			expect(recipe.example).toContain(`recipes/${recipe.name}.py`);
			expect(recipe.limits.length).toBeGreaterThan(10);
		}
	});
	it.each([
		["ghép chèn trang file A vào file B rồi highlight và chữ ký", "pdf_compose"],
		["tách file theo trang", "pdf_split"],
		["lập bảng kê danh mục bản vẽ từ khung tên", "pdf_region_table"],
		["tìm trang nào có từ khóa", "pdf_find_pages"],
		["che số điện thoại và email", "pdf_redact_terms"],
	])("finds the right recipe for %s", (query, expected) => {
		expect(sh(["python3", "recipes/recipes.py", "find", query], dir).split("\n")[0]).toContain(expected);
	});
	it("says so when nothing matches", () => {
		expect(sh(["python3", "recipes/recipes.py", "find", "xyzzy"], dir)).toContain("No recipe matches");
	});
});

describe.skipIf(!hasEngine)("recipes on real PDFs", () => {
	it("pdf_compose merges across files, highlights, stamps and numbers pages in one run", () => {
		const out = run("pdf_compose", "--parts", "inputs/B.pdf:1-5;inputs/A.pdf:2-4;inputs/B.pdf:6-", "--highlight", "15.000.000", "--highlight-pages", "1-3", "--highlight", "khong co tu nay", "--stamp", "Nguyen Van A", "--page-numbers", "--out", "outputs/c.pdf");
		expect(out).toMatchObject({ out: "outputs/c.pdf", pages: 15, highlights: { "1": 1, "2": 1, "3": 1 }, termsNotFound: ["khong co tu nay"], stamp: { page: 15, textFound: true } });
		expect(py(`d = fitz.open("outputs/c.pdf")
print(d[5].get_text().split("\\n")[0], "|", d[8].get_text().split("\\n")[0])`)).toBe("Ho so A - Trang 2 | Ho so B - Trang 6");
	});
	it("pdf_compose rejects a page outside the file with one error line", () => {
		expect(() => sh(["python3", "recipes/pdf_compose.py", "--parts", "inputs/A.pdf:9"], dir)).toThrow();
		try { sh(["python3", "recipes/pdf_compose.py", "--parts", "inputs/A.pdf:9"], dir); } catch (error) { expect(String((error as { stdout: string }).stdout)).toContain("out of range"); }
	});
	it("pdf_split by ranges, every N and bookmarks", () => {
		expect(run("pdf_split", "inputs/B.pdf", "--ranges", "1-5;6-", "--out-dir", "outputs/r").files.map((f: { pages: number }) => f.pages)).toEqual([5, 7]);
		expect(run("pdf_split", "inputs/B.pdf", "--every", "5", "--out-dir", "outputs/e").files.map((f: { pages: number }) => f.pages)).toEqual([5, 5, 2]);
		expect(run("pdf_split", "inputs/A.pdf", "--bookmarks", "--out-dir", "outputs/b").files.map((f: { pages: number }) => f.pages)).toEqual([3, 3]);
	});
	it("pdf_region_table reads the title block of every page into a CSV", () => {
		const out = run("pdf_region_table", "inputs/B.pdf", "--region", "65,92,35,6", "--out", "outputs/reg.csv");
		expect(out.pages).toBe(12);
		const csv = readFileSync(path.join(dir, "outputs/reg.csv"), "utf8");
		expect(csv).toContain("BV-07 Mat bang tang 7");
		expect(csv.trim().split("\n")).toHaveLength(13);
	});
	it("pdf_find_pages is accent-insensitive and can extract the pages", () => {
		const out = run("pdf_find_pages", "inputs/A.pdf", "--terms", "DIỆN TÍCH SÀN;Trang 3", "--match", "all", "--extract-out", "outputs/m.pdf");
		expect(out).toMatchObject({ matchingPages: [3], matchingCount: 1, extractOut: "outputs/m.pdf" });
	});
	it("pdf_redact_terms removes the text for good and says what is left", () => {
		const out = run("pdf_redact_terms", "inputs/A.pdf", "--emails", "--phones", "--terms", "Ho so A", "--out", "outputs/red.pdf");
		expect(out.redactions).toBeGreaterThan(10);
		expect(out.remainingMatches).toBe(0);
		expect(py(`d = fitz.open("outputs/red.pdf")
t = " ".join(p.get_text() for p in d)
print("a.b@example.com" in t, "0912" in t, "Ho so A" in t)`)).toBe("False False False");
	});
});
