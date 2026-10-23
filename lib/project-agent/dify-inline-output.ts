export interface DifyAgentToolThought {
	id?: unknown;
	position?: unknown;
	tool?: unknown;
	tool_input?: unknown;
	observation?: unknown;
}

export interface DifyInlineFile {
	name: string;
	bytes: Uint8Array;
	/** Set for a large PDF already stored in the board file library; bytes is then empty. */
	resource?: { boardId: string; resourceId: string; size: number };
}

const MAX_INLINE_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "xlsx", "pptx", "html", "htm", "png", "csv", "tsv", "txt", "md", "json", "jsonl", "xml", "yaml", "yml", "log"]);
const SIMPLE_ESCAPES: Record<string, number> = {
	"\\": 0x5c, "'": 0x27, '"': 0x22, a: 0x07, b: 0x08, f: 0x0c, n: 0x0a, r: 0x0d, t: 0x09, v: 0x0b,
};

function decodePythonBytes(observation: string): Uint8Array | null {
	const marker = observation.indexOf("blob=b");
	if (marker < 0) return null;
	const quote = observation[marker + 6];
	if (quote !== "'" && quote !== '"') return null;
	const bytes: number[] = [];
	for (let index = marker + 7; index < observation.length; index += 1) {
		const char = observation[index];
		if (char === quote) return bytes.length && bytes.length <= MAX_INLINE_FILE_BYTES ? Uint8Array.from(bytes) : null;
		if (char !== "\\") {
			const code = char.charCodeAt(0);
			if (code > 0x7e || code < 0x20) return null;
			bytes.push(code);
		} else {
			const escaped = observation[++index];
			if (!escaped) return null;
			if (escaped === "x") {
				const hex = observation.slice(index + 1, index + 3);
				if (!/^[0-9a-f]{2}$/i.test(hex)) return null;
				bytes.push(Number.parseInt(hex, 16));
				index += 2;
			} else if (/[0-7]/.test(escaped)) {
				const octal = (escaped + observation.slice(index + 1, index + 3).match(/^[0-7]{0,2}/)?.[0]);
				bytes.push(Number.parseInt(octal, 8) & 0xff);
				index += octal.length - 1;
			} else if (Object.hasOwn(SIMPLE_ESCAPES, escaped)) {
				bytes.push(SIMPLE_ESCAPES[escaped]);
			} else {
				bytes.push(0x5c, escaped.charCodeAt(0));
			}
		}
		if (bytes.length > MAX_INLINE_FILE_BYTES) return null;
	}
	return null;
}

function safeOutputName(toolInput: unknown): string | null {
	let input = toolInput;
	if (typeof input === "string") {
		try { input = JSON.parse(input); } catch { return null; }
	}
	if (!input || typeof input !== "object") return null;
	const candidate = (input as Record<string, unknown>).output_filename;
	if (typeof candidate !== "string") return null;
	const name = candidate.split(/[\\/]/).at(-1)?.replace(/[\r\n\0]/g, "_").slice(0, 160) ?? "";
	const extension = name.split(".").at(-1)?.toLowerCase();
	return /^[\p{L}\p{N}][\p{L}\p{N} ._()-]*\.[a-z0-9]+$/iu.test(name) && ALLOWED_EXTENSIONS.has(extension ?? "") ? name : null;
}

// Excel Tools (json2excel) reports the file it produced as "Excel file 'name.xlsx' generated successfully" before the blob.
function reportedOutputName(tool: string, observation: string): string | null {
	if (/^json2excel$/i.test(tool)) {
		const match = observation.match(/^Excel file '([^'\\/]{1,160})' generated successfully/);
		const name = match?.[1];
		return name && /^[\p{L}\p{N}][\p{L}\p{N} ._()-]*\.xlsx$/iu.test(name) ? name : null;
	}
	if (/^markdown_to_docx_converter$/i.test(tool)) {
		// The DOC plugin names its output after the document title: "Document '<title>' generated successfully".
		const title = observation.match(/^Document '([^'\n]{1,120})' generated successfully/)?.[1];
		if (!title) return null;
		const base = title.replace(/[\\/:*?"<>|\r\n\0]/g, " ").replace(/\s+/g, " ").trim().replace(/^[^\p{L}\p{N}]+/u, "");
		const name = `${base || "document"}.docx`;
		return /^[\p{L}\p{N}][\p{L}\p{N} ._()-]*\.docx$/iu.test(name) ? name : null;
	}
	if (/^markdown_to_pptx_converter$/i.test(tool)) {
		// The PPT plugin (stvlynn) saves "<title with spaces replaced by underscores>.pptx".
		const title = observation.match(/^PowerPoint presentation '([^'\n]{1,120})' generated successfully/)?.[1];
		if (!title) return null;
		const base = title.replace(/[\\/:*?"<>|\r\n\0]/g, " ").trim().replace(/\s+/g, "_").replace(/^[^\p{L}\p{N}]+/u, "");
		const name = `${base || "presentation"}.pptx`;
		return /^[\p{L}\p{N}][\p{L}\p{N} ._()-]*\.pptx$/iu.test(name) ? name : null;
	}
	return null;
}

function hasExpectedSignature(name: string, bytes: Uint8Array): boolean {
	const extension = name.split(".").at(-1)?.toLowerCase();
	if (["docx", "xlsx", "pptx"].includes(extension ?? "")) return bytes[0] === 0x50 && bytes[1] === 0x4b;
	if (extension === "pdf") return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
	if (extension === "png") return bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
	return true;
}

export function extractDifyInlineFiles(thoughts: DifyAgentToolThought[]): DifyInlineFile[] {
	const files = new Map<string, DifyInlineFile>();
	for (const thought of thoughts) {
		if (typeof thought.tool !== "string" || typeof thought.observation !== "string") continue;
		const isMarkdownExporter = /^md_to_(pdf|docx|xlsx|pptx|html|png)$/i.test(thought.tool);
		const reportedName = reportedOutputName(thought.tool, thought.observation);
		if (!isMarkdownExporter && !reportedName) continue;
		const name = isMarkdownExporter ? safeOutputName(thought.tool_input) : reportedName;
		if (!name) continue;
		const bytes = decodePythonBytes(thought.observation);
		if (!bytes || !hasExpectedSignature(name, bytes)) continue;
		files.set(name, { name, bytes });
	}
	// The agent sometimes exports the same workbook twice under slightly different names; keep the first of identical payloads.
	const seen = new Set<string>();
	// Excel Tools appends ".xlsx" when the requested name already had it ("a.xlsx.xlsx"): treat that as the same workbook.
	const names = new Set([...files.keys()]);
	for (const [name, file] of [...files]) {
		if (!/\.xlsx\.xlsx$/i.test(name)) continue;
		const clean = name.slice(0, -5);
		files.delete(name);
		if (!names.has(clean)) files.set(clean, { name: clean, bytes: file.bytes });
	}
	// The PPT plugin names an untitled retry "Presentation.pptx"; it is a duplicate attempt when a titled deck exists.
	if (files.has("Presentation.pptx") && [...files.keys()].some((name) => /\.pptx$/i.test(name) && name !== "Presentation.pptx")) files.delete("Presentation.pptx");
	return [...files.values()].filter((file) => {
		const key = `${file.bytes.length}:${Buffer.from(file.bytes).toString("base64")}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
