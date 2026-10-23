import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { containerName, workspaceDir } from "../runtime/sandbox";
import { isLivePort } from "./token";

export interface LivePreview { port: number; title: string; startedAt: string }

/** The agent registers a server it started with `webkit.py serve` or `webkit.py preview`; each one is a small json file in the chat workspace. */
export function parsePreviewFile(text: string): LivePreview | null {
	try {
		const value = JSON.parse(text) as Partial<LivePreview>;
		if (!isLivePort(Number(value.port))) return null;
		return { port: Number(value.port), title: String(value.title ?? "").slice(0, 80) || `Port ${value.port}`, startedAt: String(value.startedAt ?? "") };
	} catch { return null; }
}

export const sandboxRunning = (chatKey: string) => new Promise<boolean>((resolve) => {
	execFile("docker", ["inspect", "-f", "{{.State.Running}}", containerName(chatKey)], { timeout: 8000 }, (error, stdout) => resolve(!error && stdout.trim() === "true"));
});

export async function listLivePreviews(chatKey: string): Promise<LivePreview[]> {
	if (!(await sandboxRunning(chatKey))) return [];
	const folder = path.join(workspaceDir(chatKey), ".preview");
	const names = await fs.readdir(folder).catch(() => [] as string[]);
	const found = await Promise.all(names.filter((name) => /^\d+\.json$/.test(name)).map(async (name) => parsePreviewFile(await fs.readFile(path.join(folder, name), "utf8").catch(() => ""))));
	return found.filter((item): item is LivePreview => Boolean(item)).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
