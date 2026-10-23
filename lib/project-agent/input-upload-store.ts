import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectAgentTaskInputFile } from "./types";

const STAGING_DIR = path.join(process.cwd(), "data", "project-agent", "input-staging");
const INPUTS_DIR = path.join(process.cwd(), "data", "project-agent", "inputs");
let lastCleanupAt = 0;

interface StagedInput extends ProjectAgentTaskInputFile {
	projectId: string;
	ownerEmail: string;
}

function validId(value: string): boolean {
	return /^[a-f0-9-]{36}$/.test(value);
}

async function cleanupStaleUploads(): Promise<void> {
	if (Date.now() - lastCleanupAt < 60 * 60 * 1000) return;
	lastCleanupAt = Date.now();
	const directories = await fs.readdir(STAGING_DIR).catch(() => []);
	await Promise.all(directories.map(async (id) => {
		const directory = path.join(STAGING_DIR, id);
		const stat = await fs.stat(directory).catch(() => null);
		if (stat && Date.now() - stat.mtimeMs > 24 * 60 * 60 * 1000) {
			await fs.rm(directory, { recursive: true, force: true });
		}
	}));
}

export async function storeProjectAgentInputUpload(
	metadata: StagedInput,
	chunks: AsyncIterable<Uint8Array>,
	maxBytes: number,
): Promise<ProjectAgentTaskInputFile> {
	await cleanupStaleUploads();
	if (!validId(metadata.id)) throw new Error("Invalid upload ID");
	const directory = path.join(STAGING_DIR, metadata.id);
	await fs.mkdir(directory, { recursive: true, mode: 0o700 });
	const filePath = path.join(directory, "original");
	let size = 0;
	try {
		const handle = await fs.open(filePath, "wx", 0o600);
		try {
			for await (const chunk of chunks) {
				size += chunk.byteLength;
				if (size > maxBytes) throw new Error("Attachment exceeds the configured per-file limit");
				await handle.writeFile(chunk);
			}
		} finally {
			await handle.close();
		}
		if (size === 0) throw new Error("Attachment is empty");
		const staged: StagedInput = { ...metadata, size };
		await fs.writeFile(path.join(directory, "metadata.json"), JSON.stringify(staged), { mode: 0o600 });
		return { id: staged.id, name: staged.name, mimeType: staged.mimeType, size: staged.size };
	} catch (error) {
		await fs.rm(directory, { recursive: true, force: true });
		throw error;
	}
}

export async function adoptProjectAgentInputUpload(
	taskId: string,
	file: ProjectAgentTaskInputFile,
	projectId: string,
	ownerEmail: string,
): Promise<void> {
	if (!validId(file.id) || !/^pat_[a-f0-9]{12}$/.test(taskId)) throw new Error("Invalid Project Agent input file path");
	const stagedDir = path.join(STAGING_DIR, file.id);
	const metadata = JSON.parse(await fs.readFile(path.join(stagedDir, "metadata.json"), "utf-8")) as StagedInput;
	if (metadata.id !== file.id || metadata.projectId !== projectId || metadata.ownerEmail !== ownerEmail
		|| metadata.name !== file.name || metadata.mimeType !== file.mimeType || metadata.size !== file.size) {
		throw new Error("Project Agent upload does not belong to this user or task");
	}
	const destination = path.join(INPUTS_DIR, taskId);
	await fs.mkdir(destination, { recursive: true, mode: 0o700 });
	await fs.rename(path.join(stagedDir, "original"), path.join(destination, file.id));
	await fs.rm(stagedDir, { recursive: true, force: true });
}
