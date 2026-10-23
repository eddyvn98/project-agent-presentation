import fs from "node:fs/promises";
import { isInteractiveHtmlName } from "../interactive-html";
import { execInSandbox, resolveWorkspacePath, workspaceDir } from "./sandbox";

/** Top-level files in /work/outputs written since the run started, for a final reply that forgot to list its deliverables. */
export async function newOutputFiles(chatId: string, sinceMs: number): Promise<string[]> {
	const dir = `${workspaceDir(chatId)}/outputs`;
	const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
	const found: string[] = [];
	for (const entry of entries) {
		if (!entry.isFile() || entry.name.startsWith(".")) continue;
		const stat = await fs.stat(`${dir}/${entry.name}`).catch(() => null);
		if (stat && stat.size > 0 && stat.mtimeMs >= sinceMs - 1_000) found.push(`outputs/${entry.name}`);
	}
	return found.slice(0, 10);
}

/** HTML pages open in the user's browser preview, which LibreOffice cannot show faithfully; check the markup instead of rendering it. */
export async function checkHtmlPage(chatId: string, relative: string): Promise<string> {
	const html = await fs.readFile(resolveWorkspacePath(chatId, relative), "utf8").catch(() => null);
	if (html === null) return `Could not read ${relative}.`;
	const problems: string[] = [];
	const interactive = isInteractiveHtmlName(relative);
	if (!interactive && /<script\b/i.test(html)) problems.push("it contains <script>, which the static preview blocks (name it *.web.html to run scripts)");
	const external = [...html.matchAll(/(?:src|href)=["'](https?:\/\/[^"']+)|url\(\s*["']?(https?:\/\/[^"')\s]+)/gi)].map((match) => match[1] ?? match[2]);
	const blocked = external.filter((url) => !interactive || !/^https:\/\/(?:cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//i.test(url));
	if (blocked.length) problems.push(`it loads external resources the preview blocks (${blocked.slice(0, 3).join(", ")}); ${interactive ? "only cdnjs, jsDelivr, unpkg and Google Fonts are allowed, and images must be embedded as data: URIs" : "inline everything"}`);
	if (!/<title>[^<]+<\/title>/i.test(html)) problems.push("it has no <title>");
	const tags = (html.match(/<[a-z][^>]*>/gi) ?? []).length;
	return `${relative} is an HTML page (${Math.round(html.length / 1024)} KB, ${tags} elements); it opens in the user's browser preview, so it is not rendered here (LibreOffice would show it wrongly). ${problems.length ? `Fix: ${problems.join("; ")}.` : "No blocked scripts or external resources found."}`;
}

/**
 * Writes formula results into delivered workbooks (openpyxl leaves them empty, so previews and phone viewers show blank
 * cells). Best effort: a workbook LibreOffice cannot open is delivered as it is.
 */
export async function storeWorkbookValues(chatId: string, files: string[]): Promise<void> {
	for (const file of files.filter((name) => /\.xlsx$/i.test(name)).slice(0, 5)) {
		const relative = file.replace(/^\/?work\//, "");
		try { resolveWorkspacePath(chatId, relative); } catch { continue; }
		await execInSandbox(chatId, `cd /work && HOME=/tmp python3 .tools/xlsx_values.py '${relative.replace(/'/g, "'\\''")}'`, 240).catch(() => null);
	}
}
