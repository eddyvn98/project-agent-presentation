import fs from "node:fs/promises";
import path from "node:path";
import { parseRuntimeActions, type RuntimeAction } from "./actions";
import { callRuntimeModel } from "./model";
import { render } from "./render-action";
import { resolveWorkspacePath } from "./sandbox";
import type { RuntimeInput } from "./run-agent";
import { recordSubUsage } from "./sub-agent";
import { subAgentSelector } from "./sub-agent-model";

type TranscribeAction = Extract<RuntimeAction, { action: "transcribe_tables" }>;

const MAX_PAGES = 12;
const PARALLEL = 3;
const WHOLE_PAGE = { x: 0, y: 0, width: 100, height: 100 };

const prompt = (page: number) => `The image is page ${page} of a scanned document. Transcribe every table on it into GitHub-flavoured Markdown, exactly as printed: the header row first, one row per row of the table, every cell's text unchanged (keep Vietnamese diacritics), a cell merged over several rows repeated in each row it covers, empty cells left empty. Text on the page outside the table goes above or below the table as plain lines. Do not summarise, translate, add comments or correct what you read. If the page holds no table, answer exactly NO_TABLE. Reply with ONLY this JSON, the Markdown inside the answer string: {"action":"final","answer":"<markdown>"}`;

/** The Markdown the cheap model put in its final answer; plain text is accepted too. */
export function tableMarkdownFrom(reply: string): string {
	const parsed = parseRuntimeActions(reply);
	const final = Array.isArray(parsed) ? parsed.find((action) => action.action === "final") : undefined;
	return (final && final.action === "final" ? final.answer : reply).replace(/^```(?:markdown|md)?\s*|\s*```$/gim, "").trim();
}

async function transcribePage(input: RuntimeInput, action: TranscribeAction, page: number, selector: string | undefined): Promise<{ page: number; file?: string; error?: string }> {
	const rendered = await render(input.chatId, undefined, input.user, action.path, [page], 900 + page, WHOLE_PAGE);
	if (!rendered.image) return { page, error: rendered.text.split("\n")[0].slice(0, 160) };
	const reply = await callRuntimeModel({ query: prompt(page), user: input.user, images: [rendered.image], modelSelector: selector, signal: input.signal });
	recordSubUsage(input, `steps=1 prompt_tokens=${reply.promptTokens ?? 0}`, selector);
	const markdown = tableMarkdownFrom(reply.answer);
	if (/^NO_TABLE\b/i.test(markdown)) return { page, error: "the model saw no table on this page" };
	if (markdown.split("\n").filter((line) => line.trim().startsWith("|")).length < 2) return { page, error: "the reply had no Markdown table" };
	const file = `outputs/work/tables/p${String(page).padStart(3, "0")}.md`;
	const target = resolveWorkspacePath(input.chatId, file);
	await fs.mkdir(path.dirname(target), { recursive: true });
	await fs.writeFile(target, `${markdown}\n`);
	return { page, file };
}

/** Transcribes table pages of a scanned PDF in parallel on a fast vision model and saves outputs/work/tables/pNNN.md for each, so the lead agent never has to look at those pages. */
export async function transcribeTables(input: RuntimeInput, action: TranscribeAction): Promise<{ text: string; failed?: boolean }> {
	const pages = [...new Set(action.pages)].filter((page) => Number.isInteger(page) && page > 0 && page < 10_000).sort((a, b) => a - b).slice(0, MAX_PAGES);
	if (!pages.length) return { text: "transcribe_tables needs pages: a list of page numbers (at most 12 per call).", failed: true };
	const selector = subAgentSelector(input.modelSelector, action.model, "worker");
	input.onStep?.({ tool: "transcribe_tables", detail: `[${selector || "default model"}] pages ${pages.join(", ")}` });
	const results: Array<{ page: number; file?: string; error?: string }> = [];
	const queue = [...pages];
	await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
		for (let page = queue.shift(); page !== undefined; page = queue.shift()) {
			results.push(await transcribePage(input, action, page, selector).catch((cause) => ({ page: page as number, error: cause instanceof Error ? cause.message.slice(0, 160) : "failed" })));
		}
	}));
	results.sort((a, b) => a.page - b.page);
	const done = results.filter((result) => result.file), failed = results.filter((result) => result.error);
	const lines = [`Saved ${done.length} of ${pages.length} table pages: ${done.map((result) => result.file).join(", ") || "none"}.`];
	if (failed.length) lines.push(`Not saved: ${failed.map((result) => `page ${result.page} (${result.error})`).join("; ")}. Look at those pages yourself with render and write outputs/work/tables/pNNN.md.`);
	lines.push("Run /work/.tools/pdf_scan_to_md.py again to merge them into the Markdown.");
	return { text: lines.join("\n"), failed: !done.length };
}
