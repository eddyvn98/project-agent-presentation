import fs from "node:fs/promises";
import path from "node:path";
import * as projectCap from "@/lib/capabilities/project";
import { projectAgentTaskInputPath, readProjectAgentTaskInputFile } from "../task-store";
import { isLargePdfInput, stagedInputName } from "../large-input";
import type { ProjectAgentTask } from "../types";
import { resolveWorkspacePath } from "./sandbox";

const MAX_STAGED_BYTES = 80 * 1024 * 1024;
const MAX_STAGED_LARGE_BYTES = 2 * 1024 * 1024 * 1024;
const safeName = stagedInputName;

async function put(chatId: string, name: string, bytes: Buffer, taken: Set<string>): Promise<string> {
	let finalName = safeName(name);
	for (let copy = 2; taken.has(finalName); copy += 1) finalName = safeName(name).replace(/(\.[^.]*)?$/, `-${copy}$1`);
	taken.add(finalName);
	const target = resolveWorkspacePath(chatId, `inputs/${finalName}`);
	await fs.mkdir(path.dirname(target), { recursive: true });
	const existing = await fs.stat(target).catch(() => null);
	if (!existing || existing.size !== bytes.byteLength) await fs.writeFile(target, bytes);
	return finalName;
}

/** Large PDFs are linked or copied as files, never read into memory. */
async function putLarge(chatId: string, name: string, source: string, taken: Set<string>): Promise<string> {
	let finalName = safeName(name);
	for (let copy = 2; taken.has(finalName); copy += 1) finalName = safeName(name).replace(/(\.[^.]*)?$/, `-${copy}$1`);
	taken.add(finalName);
	const target = resolveWorkspacePath(chatId, `inputs/${finalName}`);
	await fs.mkdir(path.dirname(target), { recursive: true });
	const sourceStat = await fs.stat(source);
	const existing = await fs.stat(target).catch(() => null);
	if (!existing || existing.size !== sourceStat.size) await fs.rm(target, { force: true }).then(() => fs.copyFile(source, target)).then(() => fs.chmod(target, 0o644));
	return finalName;
}

/** Copies the task attachments and the project's original source files into the chat workspace; returns what was staged. */
export async function stageInputs(task: ProjectAgentTask, chatId: string, ownerEmail: string): Promise<string[]> {
	const taken = new Set<string>();
	const staged: string[] = [];
	let total = 0;
	let largeTotal = 0;
	for (const file of task.inputFiles ?? []) {
		if (isLargePdfInput(file)) {
			if (largeTotal + file.size > MAX_STAGED_LARGE_BYTES) continue;
			largeTotal += file.size;
			staged.push(await putLarge(chatId, file.name, projectAgentTaskInputPath(task.id, file.id), taken));
			continue;
		}
		const bytes = await readProjectAgentTaskInputFile(task.id, file.id).catch(() => null);
		if (bytes && total + bytes.byteLength <= MAX_STAGED_BYTES) { total += bytes.byteLength; staged.push(await put(chatId, file.name, bytes, taken)); }
	}
	const project = await projectCap.getProject(task.projectId, ownerEmail).catch(() => null);
	for (const source of project?.ok && project.data ? project.data.knowledgeFiles : []) {
		if (source.managed || source.origin === "agent" || source.sourceUrl) continue;
		const stored = await (source.fileType === "image" ? projectCap.readKnowledgeImage(source.id) : projectCap.readKnowledgeOriginal(source.id)).catch(() => null);
		if (stored && total + stored.buffer.byteLength <= MAX_STAGED_BYTES) { total += stored.buffer.byteLength; staged.push(await put(chatId, source.name, stored.buffer, taken)); }
	}
	return staged;
}
