import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

const SKIP = new Set(["script", "style", "noscript", "svg", "nav", "footer", "aside", "form", "iframe", "button", "select", "template", "head"]);
const BLOCK = new Set(["p", "div", "section", "article", "main", "header", "ul", "ol", "dl", "dt", "dd", "blockquote", "figure", "figcaption", "address", "details", "summary"]);
const MAX_LINK_CHARS = 200;

const squash = (value: string) => value.replace(/\s+/g, " ").trim();

function tableToMarkdown($: cheerio.CheerioAPI, table: Element): string {
	const rows = $(table).find("tr").toArray().filter((row) => $(row).closest("table").get(0) === table);
	const cells = rows.map((row) => $(row).children("td, th").toArray().flatMap((cell) => {
		const span = Math.min(Number($(cell).attr("colspan")) || 1, 6);
		return [squash($(cell).text()).replace(/\|/g, "/"), ...Array<string>(span - 1).fill("")];
	})).filter((row) => row.some(Boolean));
	if (!cells.length) return "";
	const width = Math.max(...cells.map((row) => row.length));
	const padded = cells.map((row) => [...row, ...Array<string>(width - row.length).fill("")]);
	const line = (row: string[]) => `| ${row.join(" | ")} |`;
	return `\n\n${[line(padded[0]), line(Array<string>(width).fill("---")), ...padded.slice(1).map(line)].join("\n")}\n\n`;
}

function walk($: cheerio.CheerioAPI, node: AnyNode, base: string, out: string[]): void {
	if (node.type === "text") {
		const text = node.data.replace(/\s+/g, " ");
		if (text.trim() || (text && out.length && !/\s$/.test(out[out.length - 1]))) out.push(text);
		return;
	}
	if (node.type !== "tag") return;
	const tag = node.name.toLowerCase();
	if (SKIP.has(tag) || node.attribs["aria-hidden"] === "true" || "hidden" in node.attribs) return;
	if (tag === "table") { out.push(tableToMarkdown($, node)); return; }
	if (tag === "pre") { out.push(`\n\n\`\`\`\n${$(node).text()}\n\`\`\`\n\n`); return; }
	if (/^h[1-6]$/.test(tag)) { out.push(`\n\n${"#".repeat(Number(tag[1]))} ${squash($(node).text())}\n\n`); return; }
	if (tag === "br") { out.push("\n"); return; }
	if (tag === "li") out.push("\n- ");
	if (tag === "a") {
		const text = squash($(node).text());
		let href = node.attribs.href ?? "";
		try { href = new URL(href, base).href; } catch { href = ""; }
		if (text && /^https?:/.test(href) && href.length <= MAX_LINK_CHARS && !href.startsWith(`${base}#`)) { out.push(`[${text}](${href})`); return; }
	}
	if (BLOCK.has(tag)) out.push("\n\n");
	for (const child of node.children) walk($, child, base, out);
	if (BLOCK.has(tag)) out.push("\n\n");
}

/** Converts a page to Markdown for the agent: headings, lists, links and tables survive (plain tag stripping flattens a table into a stream of numbers). */
export function htmlToMarkdown(html: string, base: string): { title: string; text: string } {
	const $ = cheerio.load(html);
	const title = squash($("title").first().text());
	const main = $("main, article, [role=main]").first();
	const root = main.length && main.text().trim().length > 500 ? main.get(0) : $("body").get(0);
	const out: string[] = [];
	if (root) walk($, root, base, out);
	return { title, text: out.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() };
}
