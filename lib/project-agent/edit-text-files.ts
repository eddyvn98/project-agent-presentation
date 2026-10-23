const MAX_EDIT_BYTES = 20 * 1024 * 1024;
const JSON_EXTENSIONS = new Set(["json", "jsonl"]);

export interface TextEditSpec {
	replacements?: Array<{ find?: string; replace?: string }>;
}

export interface TextEditResult {
	bytes: Uint8Array;
	summary: string[];
	warnings: string[];
}

export const EDITABLE_TEXT_EXTENSIONS = new Set([
	"txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "xml", "yaml", "yml", "log", "html", "htm",
]);

export function editTextFile(bytes: Uint8Array, extension: string, spec: TextEditSpec): TextEditResult {
	if (!EDITABLE_TEXT_EXTENSIONS.has(extension)) throw new Error(`cannot edit .${extension} files`);
	let original: string;
	try { original = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
	catch { throw new Error("text file is not valid UTF-8; no changes were saved"); }

	const summary: string[] = [];
	const warnings: string[] = [];
	let updated = original;
	for (const item of (spec.replacements ?? []).slice(0, 100)) {
		const find = String(item.find ?? "");
		const replace = String(item.replace ?? "");
		if (!find) { warnings.push("Skipped an empty search string"); continue; }
		const count = updated.split(find).length - 1;
		if (!count) { warnings.push(`Text not found: "${find.slice(0, 80)}"`); continue; }
		updated = updated.split(find).join(replace);
		summary.push(`Replaced "${find.slice(0, 80)}" with "${replace.slice(0, 80)}" (${count} place${count === 1 ? "" : "s"})`);
	}

	if (JSON_EXTENSIONS.has(extension)) {
		try {
			const withoutBom = updated.replace(/^\uFEFF/, "");
			if (extension === "json") JSON.parse(withoutBom);
			else withoutBom.split(/\r?\n/).filter(Boolean).forEach((line) => JSON.parse(line));
		} catch {
			throw new Error(`edit would make .${extension} invalid; no changes were saved`);
		}
	}

	const output = new TextEncoder().encode(updated);
	if (output.byteLength > MAX_EDIT_BYTES) throw new Error("edited text file exceeds the 20 MiB limit; no changes were saved");
	return { bytes: output, summary, warnings };
}
