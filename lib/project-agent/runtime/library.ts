import fs from "node:fs/promises";
import path from "node:path";
import { workspaceDir } from "./sandbox";

/** One script library per project: agents reuse, improve (same name) or add (new name) scripts. Scripts can carry document text, so they never leave their project. */
const LIBRARY_ROOT = path.join(process.cwd(), "data", "project-agent", "script-library");
const libraryDir = (projectId: string) => path.join(LIBRARY_ROOT, projectId.replace(/[^\w-]/g, "_").slice(0, 80));
const MAX_LISTED = 40;
const MAX_SAVED = 300;
const MAX_HISTORY_PER_SCRIPT = 3;
const MAX_SCRIPT_BYTES = 40 * 1024;
const SCRIPT_PATTERN = /^[\w.-]{3,80}\.(py|js|sh)$/i;

const LITERAL = /"""[\s\S]*?"""|'''[\s\S]*?'''|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g;

/** True when a script carries pasted document text (long prose string literals); those stay out of the library so they cannot leak content between tasks. */
export function embedsDocumentText(source: string): boolean {
	let prose = 0;
	for (const [literal] of source.matchAll(LITERAL)) {
		if (literal.length >= 400 && literal.split(/\s+/).length >= 60) return true;
		if (literal.length >= 60 && literal.split(/\s+/).length >= 10) prose += literal.length;
	}
	return prose >= 1500;
}

interface Script { name: string; bytes: Buffer; mtime: number }

async function listScripts(directory: string): Promise<Script[]> {
	const scripts: Script[] = [];
	for (const name of (await fs.readdir(directory).catch(() => [])).filter((entry) => SCRIPT_PATTERN.test(entry))) {
		const file = path.join(directory, name);
		const [bytes, stat] = await Promise.all([fs.readFile(file).catch(() => null), fs.stat(file).catch(() => null)]);
		if (bytes && stat && bytes.byteLength <= MAX_SCRIPT_BYTES && !embedsDocumentText(bytes.toString("utf8"))) scripts.push({ name, bytes, mtime: stat.mtimeMs });
	}
	return scripts.sort((a, b) => b.mtime - a.mtime);
}

const headerOf = (bytes: Buffer) => bytes.toString("utf8").split("\n").map((line) => line.replace(/^\s*(#|\/\/|"""|''')\s*/, "").replace(/("""|''')$/, "").trim()).find((line) => line && !line.startsWith("!") && !/^(import|from|const|let|var)\b/.test(line))?.slice(0, 110) ?? "";

/** Copies the project's most recently improved scripts into the chat workspace and returns a short index for the prompt. */
export async function syncLibraryIn(projectId: string, chatId: string): Promise<string> {
	const scripts = (await listScripts(libraryDir(projectId))).slice(0, MAX_LISTED);
	if (!scripts.length) return "";
	const target = path.join(workspaceDir(chatId), "library");
	await fs.mkdir(target, { recursive: true });
	for (const script of scripts) await fs.writeFile(path.join(target, script.name), script.bytes);
	return scripts.map((script) => `- library/${script.name}: ${headerOf(script.bytes) || "(no header)"}`).join("\n");
}

async function archive(directory: string, name: string, previous: Buffer): Promise<void> {
	const history = path.join(directory, "_history");
	await fs.mkdir(history, { recursive: true });
	await fs.writeFile(path.join(history, `${name}.${Date.now()}`), previous);
	const old = (await fs.readdir(history)).filter((entry) => entry.startsWith(`${name}.`)).sort();
	for (const entry of old.slice(0, Math.max(0, old.length - MAX_HISTORY_PER_SCRIPT))) await fs.unlink(path.join(history, entry)).catch(() => {});
}

/** Keeps the scripts a finished task wrote under /work/scripts: new names are added, same names are improved (the previous version is archived). */
export async function saveScriptsOut(projectId: string, chatId: string): Promise<number> {
	const scripts = await listScripts(path.join(workspaceDir(chatId), "scripts"));
	if (!scripts.length) return 0;
	const directory = libraryDir(projectId);
	await fs.mkdir(directory, { recursive: true });
	const existing = new Map((await listScripts(directory)).map((script) => [script.name, script.bytes]));
	let saved = 0;
	for (const script of scripts) {
		const previous = existing.get(script.name);
		if (previous?.equals(script.bytes)) continue;
		if (!previous && existing.size + saved >= MAX_SAVED) continue;
		if (previous) await archive(directory, script.name, previous).catch(() => {});
		await fs.writeFile(path.join(directory, script.name), script.bytes);
		saved += 1;
	}
	return saved;
}
