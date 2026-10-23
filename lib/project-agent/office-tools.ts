import { createHash } from "crypto";
import type { DifyAgentToolThought, DifyInlineFile } from "./dify-inline-output";

const TOOL_NAMES = /^(create_xlsx|create_docx|create_pptx|edit_xlsx)$/i;
const MAX_BYTES = 20 * 1024 * 1024;
const EXTENSIONS = new Set(["xlsx", "docx", "pptx"]);

export interface OfficeToolLink { name: string; url: string }

/** Base URL of the Office Tools service (never committed; set in the environment). */
export function getOfficeToolsUrl(): string | null {
	const value = process.env.OFFICE_TOOLS_URL?.trim();
	if (!value) return null;
	try { return new URL(value).origin; } catch { return null; }
}

function allowedOrigins(): Set<string> {
	const origins = new Set<string>();
	for (const value of [process.env.OFFICE_TOOLS_URL, process.env.OFFICE_TOOLS_PUBLIC_URL]) {
		try { if (value?.trim()) origins.add(new URL(value.trim()).origin); } catch { /* ignore invalid env */ }
	}
	return origins;
}

/** Identity the agent must pass to Office Tools so the service can log, rate-limit and meter per user/project. */
export function officeToolsContext(ownerEmail: string, projectId: string): string {
	if (!getOfficeToolsUrl()) return "";
	const user = `u_${createHash("sha256").update(ownerEmail.trim().toLowerCase()).digest("hex").slice(0, 20)}`;
	const project = projectId.replace(/[^\w\-:.@]/g, "_").slice(0, 80);
	return `Office Tools context: pass user_id="${user}" and project_id="${project}" on every Office Tools call.`;
}

/** Successful create/edit calls only: the service reports ok=false while lint issues remain. */
export function extractOfficeToolLinks(thoughts: DifyAgentToolThought[]): { links: OfficeToolLink[]; failedCalls: number } {
	const links = new Map<string, OfficeToolLink>();
	let failedCalls = 0;
	for (const thought of thoughts) {
		if (typeof thought.tool !== "string" || !TOOL_NAMES.test(thought.tool) || typeof thought.observation !== "string") continue;
		let payload: unknown;
		try { payload = JSON.parse(thought.observation); } catch { failedCalls += 1; continue; }
		const result = payload as { ok?: unknown; file?: { name?: unknown; url?: unknown } };
		if (result.ok !== true || typeof result.file?.url !== "string" || typeof result.file?.name !== "string") { failedCalls += 1; continue; }
		const name = result.file.name.split(/[\\/]/).at(-1) ?? "";
		const extension = name.split(".").at(-1)?.toLowerCase() ?? "";
		if (!/^[\p{L}\p{N}][\p{L}\p{N} ._()-]*$/u.test(name) || !EXTENSIONS.has(extension)) continue;
		links.set(name, { name, url: result.file.url });
	}
	return { links: [...links.values()], failedCalls };
}

export async function downloadOfficeToolFiles(links: OfficeToolLink[], fetcher: typeof fetch = fetch): Promise<DifyInlineFile[]> {
	const origins = allowedOrigins();
	const files: DifyInlineFile[] = [];
	for (const link of links) {
		let url: URL;
		try { url = new URL(link.url); } catch { continue; }
		if (!origins.has(url.origin)) continue; // never fetch arbitrary hosts named by the model
		const response = await fetcher(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
		if (!response.ok) continue;
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.length === 0 || bytes.length > MAX_BYTES || bytes[0] !== 0x50 || bytes[1] !== 0x4b) continue;
		files.push({ name: link.name, bytes });
	}
	return files;
}
