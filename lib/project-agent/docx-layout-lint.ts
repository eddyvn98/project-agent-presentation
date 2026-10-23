import JSZip from "jszip";

const MIN_COLUMN_TWIPS = 500;
const MIN_CHARS_PER_PAGE = 900;

/** Layout defects visible in the DOCX XML and page count that a text read-back cannot show. */
export async function lintDocxLayout(bytes: Uint8Array, pageCount?: number): Promise<string[]> {
	const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")?.async("string");
	if (!xml) return [];
	const issues: string[] = [];
	const tables = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];
	let broken = 0;
	for (const table of tables) {
		const grid = [...table.matchAll(/<w:gridCol\b[^>]*w:w="(\d+)"/g)].map((match) => Number(match[1]));
		const firstRow = table.match(/<w:tr\b[\s\S]*?<\/w:tr>/)?.[0] ?? "";
		const cells = [...firstRow.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].reduce((sum, cell) => sum + Number(cell[1].match(/<w:gridSpan w:val="(\d+)"/)?.[1] ?? 1), 0);
		if (grid.length === 0 || (cells > 0 && grid.length !== cells) || (grid.length > 1 && Math.min(...grid) < MIN_COLUMN_TWIPS)) broken += 1;
	}
	if (broken) issues.push(`${broken} of ${tables.length} tables have a broken column grid (missing, mismatched with the cells, or columns narrower than 0.35 inch), so their text wraps one letter per line; set a tblGrid whose gridCol widths match the cells and sum to the text width`);
	const levels = [...xml.matchAll(/<w:pStyle w:val="Heading([1-9])"\/>/g)].map((match) => Number(match[1]));
	const skips = levels.filter((level, index) => index > 0 && level > levels[index - 1] + 1).length;
	if (skips > 0) issues.push(`the heading hierarchy skips levels ${skips} time(s) (for example Heading 1 directly followed by Heading 3), which means heading levels were shifted; keep the levels of the source structure so Heading 2 sits between Heading 1 and Heading 3`);
	if (pageCount && pageCount > 10) {
		const chars = (xml.match(/<w:t[ >][^<]*/g) ?? []).join("").length;
		if (chars / pageCount < MIN_CHARS_PER_PAGE) issues.push(`the file renders to ${pageCount} pages for only ${chars} characters, so pages are mostly empty or the layout is broken`);
	}
	return issues;
}

const norm = (text: string) => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim();
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Compares the page numbers printed in the table of contents with the pages where the headings really render. */
export async function lintTocPageNumbers(bytes: Uint8Array, renderedText: string): Promise<string[]> {
	const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")?.async("string");
	if (!xml) return [];
	const headings = [...xml.matchAll(/<w:p\b(?:(?!<\/w:p>)[\s\S])*?<w:pStyle w:val="Heading1"\/>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g)]
		.map((match) => norm([...match[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((text) => text[1]).join("")).slice(0, 30)).filter((heading) => heading.length > 3);
	const pages = [...renderedText.matchAll(/\[Page (\d+)\]([\s\S]*?)(?=\n\[Page \d+\]|$)/g)].map((match) => ({ page: Number(match[1]), text: norm(match[2]) }));
	const wrong: string[] = [];
	let checked = 0;
	for (const heading of headings) {
		const hits = pages.filter((page) => page.text.includes(heading));
		if (hits.length < 2) continue;
		const claimed = Number(hits[0].text.match(new RegExp(`${escapeRegExp(heading)}[^.]{0,120}[.·…]{3,}\\s*(\\d{1,3})`))?.[1]);
		if (!Number.isFinite(claimed)) continue;
		checked += 1;
		const actual = hits.at(-1)!.page;
		if (Math.abs(claimed - actual) > 1) wrong.push(`"${heading}" is listed on page ${claimed} but renders on page ${actual}`);
	}
	return checked >= 3 && wrong.length >= Math.ceil(checked / 3) ? [`the table of contents page numbers do not match the render: ${wrong.slice(0, 9).join("; ")}; write the measured page numbers`] : [];
}
