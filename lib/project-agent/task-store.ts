import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { CreateProjectAgentTaskInput, ProjectAgentTask } from "./types";
import { isProjectAgentTaskStale } from "./task-stale";
import { deleteContextScope } from "./runtime/context-output-store";
import { encodeProjectAgentTaskCursor, type ProjectAgentTaskCursor } from "./task-pagination";
import {
	findProjectAgentTask,
	findProjectAgentTaskByWorkspaceTurn,
	listProjectAgentTasks as listStoredProjectAgentTasks,
	patchProjectAgentTask,
	saveProjectAgentTask,
	deleteProjectAgentConversation as deleteStoredProjectAgentConversation,
} from "@/services/mongodb/projectAgentTasks.repo";
import { adoptProjectAgentInputUpload } from "./input-upload-store";
import { getKnowledgeOriginalPath, readKnowledgeImage } from "@/lib/capabilities/project-knowledge";
import { recordFinishedTask } from "./insights-store";
import { scoreLessonTrials } from "./learning/global-lessons";
import { normalizeProjectAgentModelSelector } from "./model-selector";
import { deterministicAgentTaskId } from "./task-idempotency";

const TASKS_DIR = path.join(process.cwd(), "data", "project-agent", "tasks");
const FILES_DIR = path.join(process.cwd(), "data", "project-agent", "files");
const INPUTS_DIR = path.join(process.cwd(), "data", "project-agent", "inputs");
const MAX_TASK_AGE_MS = 24 * 60 * 60 * 1000;
let legacyMigrationPromise: Promise<void> | null = null;

function taskPath(taskId: string): string {
	return path.join(TASKS_DIR, `${taskId}.json`);
}

async function writeLegacySnapshot(task: ProjectAgentTask): Promise<void> {
	await fs.mkdir(TASKS_DIR, { recursive: true });
	const destination = taskPath(task.id);
	const temporary = `${destination}.${randomUUID()}.tmp`;
	await fs.writeFile(temporary, JSON.stringify(task, null, 2), "utf-8");
	await fs.rename(temporary, destination);
}

async function cleanupOldTasks(): Promise<void> {
	const files = await fs.readdir(TASKS_DIR).catch(() => []);
	const now = Date.now();
	await Promise.all(files.filter((file) => file.endsWith(".json")).map(async (file) => {
		const filePath = path.join(TASKS_DIR, file);
		const stat = await fs.stat(filePath).catch(() => null);
		if (stat && now - stat.mtimeMs > MAX_TASK_AGE_MS) {
			await fs.unlink(filePath).catch(() => {});
			await fs.rm(path.join(FILES_DIR, path.basename(file, ".json")), { recursive: true, force: true }).catch(() => {});
			await fs.rm(path.join(INPUTS_DIR, path.basename(file, ".json")), { recursive: true, force: true }).catch(() => {});
		}
	}));
}

export function projectAgentTaskInputPath(taskId: string, fileId: string): string {
	if (!/^pat_[a-f0-9]{12}$/.test(taskId) || !/^[a-f0-9-]{36}$/.test(fileId)) throw new Error("Invalid Project Agent input file path");
	return path.join(INPUTS_DIR, taskId, fileId);
}

export async function readProjectAgentTaskInputFile(taskId: string, fileId: string): Promise<Buffer> {
	if (!/^pat_[a-f0-9]{12}$/.test(taskId) || !/^[a-f0-9-]{36}$/.test(fileId)) {
		throw new Error("Invalid Project Agent input file path");
	}
	return fs.readFile(path.join(INPUTS_DIR, taskId, fileId));
}

export async function writeProjectAgentFile(taskId: string, fileId: string, bytes: Uint8Array): Promise<void> {
	if (!/^pat_[a-f0-9]{12}$/.test(taskId) || !/^[a-f0-9-]{36}$/.test(fileId)) {
		throw new Error("Invalid Project Agent file path");
	}
	const directory = path.join(FILES_DIR, taskId);
	await fs.mkdir(directory, { recursive: true, mode: 0o700 });
	await fs.writeFile(path.join(directory, fileId), bytes, { mode: 0o600 });
}

export async function readProjectAgentFile(taskId: string, fileId: string): Promise<Buffer> {
	if (!/^pat_[a-f0-9]{12}$/.test(taskId) || !/^[a-f0-9-]{36}$/.test(fileId)) {
		throw new Error("Invalid Project Agent file path");
	}
	return fs.readFile(path.join(FILES_DIR, taskId, fileId));
}

/** Puts a Project source (document original or image) into the task's inputs without the browser uploading it a second time. */
async function copyProjectSourceInput(taskId: string, fileId: string, sourceId: string): Promise<void> {
	const directory = path.join(INPUTS_DIR, taskId);
	await fs.mkdir(directory, { recursive: true, mode: 0o700 });
	const target = path.join(directory, fileId);
	const original = await getKnowledgeOriginalPath(sourceId);
	if (original) { await fs.link(original.path, target).catch(() => fs.copyFile(original.path, target)); return; }
	const image = await readKnowledgeImage(sourceId);
	if (!image) throw new Error("The Project source for this attachment is no longer available");
	await fs.writeFile(target, image.buffer, { mode: 0o600 });
}

export async function createProjectAgentTask(input: CreateProjectAgentTaskInput): Promise<ProjectAgentTask> {
	const now = new Date().toISOString();
	const id = input.idempotencyKey
    ? deterministicAgentTaskId(input.ownerEmail, input.idempotencyKey)
    : `pat_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  if (input.idempotencyKey) {
    const existing = await findProjectAgentTask(id);
    if (existing) {
      if (existing.ownerEmail !== input.ownerEmail ||
        existing.idempotencyKey !== input.idempotencyKey ||
        existing.projectId !== input.projectId ||
        (Boolean(input.requestFingerprint) && existing.requestFingerprint !== input.requestFingerprint))
        throw new Error("Idempotency task identity collision");
      return existing;
    }
  }
	const inputFiles = input.inputFiles?.map(({ bytes: _bytes, projectSourceId: _source, ...file }) => ({ ...file })) ?? [];
	const modelSelector = normalizeProjectAgentModelSelector(input.modelSelector);
	const task: ProjectAgentTask = {
		id,
		projectId: input.projectId,
		ownerEmail: input.ownerEmail,
		...(input.scheduleRunId ? { scheduleRunId: input.scheduleRunId } : {}),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    ...(input.requestFingerprint ? { requestFingerprint: input.requestFingerprint } : {}),
    ...(input.retryOfTaskId ? { retryOfTaskId: input.retryOfTaskId } : {}),
    ...(input.workflowRunId ? { workflowRunId: input.workflowRunId } : {}),
		projectOwnerEmail: input.projectOwnerEmail,
		// Sandbox runtime: the chat gets a stable thread id from its first task, so every turn (and every retry) shares one workspace and one chat entry.
		conversationId: input.conversationId ?? (process.env.PROJECT_AGENT_RUNTIME === "sandbox" ? id : undefined),
		...(input.engines ? { engines: input.engines } : {}),
		...(modelSelector ? { modelSelector } : {}),
		...(input.boardId ? { boardId: input.boardId, workspaceBoardId: input.boardId } : {}),
		...(input.workspaceTurnId ? { workspaceTurnId: input.workspaceTurnId } : {}),
		...(input.userPrompt?.trim() ? { userPrompt: input.userPrompt.trim() } : {}),
		prompt: input.prompt,
		status: "queued",
		createdAt: now,
		updatedAt: now,
		log: [`${now} queued`],
		...(inputFiles.length ? { inputFiles } : {}),
	};
	try {
		for (const file of input.inputFiles ?? []) {
			if (!/^[a-f0-9-]{36}$/.test(file.id)) throw new Error("Invalid Project Agent input file ID");
			if (file.bytes) {
				const directory = path.join(INPUTS_DIR, id);
				await fs.mkdir(directory, { recursive: true, mode: 0o700 });
				await fs.writeFile(path.join(directory, file.id), file.bytes, { mode: 0o600 });
			} else if (file.projectSourceId) {
				await copyProjectSourceInput(id, file.id, file.projectSourceId);
			} else if (input.reuseInputsFrom) {
				if (!/^pat_[a-f0-9]{12}$/.test(input.reuseInputsFrom)) throw new Error("Invalid Project Agent retry source");
				const directory = path.join(INPUTS_DIR, id);
				await fs.mkdir(directory, { recursive: true, mode: 0o700 });
				const source = path.join(INPUTS_DIR, input.reuseInputsFrom, file.id), target = path.join(directory, file.id);
				await fs.link(source, target).catch(() => fs.copyFile(source, target));
			} else {
				await adoptProjectAgentInputUpload(id, file, input.projectId, input.ownerEmail);
			}
		}
		try { await saveProjectAgentTask(task); }
		catch (cause) {
			if (!input.idempotencyKey || !/E11000|duplicate key/i.test(cause instanceof Error ? cause.message : String(cause))) throw cause;
		}
		await writeLegacySnapshot(task).catch(() => {});
	} catch (error) {
		await fs.rm(path.join(INPUTS_DIR, id), { recursive: true, force: true }).catch(() => {});
		throw error;
	}
	cleanupOldTasks().catch((error) => console.error("[project-agent] task cleanup failed", error));
  if (input.idempotencyKey) {
    const persisted = await findProjectAgentTask(id);
    if (persisted && (persisted.idempotencyKey !== input.idempotencyKey ||
      persisted.ownerEmail !== input.ownerEmail ||
      (Boolean(input.requestFingerprint) && persisted.requestFingerprint !== input.requestFingerprint)))
      throw new Error("Task identity collision after concurrent insert");
    return persisted ?? task;
  }
	return task;
}

export async function readProjectAgentTask(taskId: string): Promise<ProjectAgentTask | null> {
	const stored = await findProjectAgentTask(taskId);
	if (stored) return stored;
	try {
		const raw = await fs.readFile(taskPath(taskId), "utf-8");
		const legacy = await normalizeLegacyTask(JSON.parse(raw) as ProjectAgentTask, taskPath(taskId));
		if (legacy.id !== taskId || !legacy.projectId || !legacy.ownerEmail) return null;
		await saveProjectAgentTask(legacy);
		return legacy;
	} catch {
		return null;
	}
}

/** The task a Workspace chat turn started for this user on this board, if any. */
export const readProjectAgentTaskByWorkspaceTurn = findProjectAgentTaskByWorkspaceTurn;

export async function listProjectAgentTasks(
	ownerEmails: string[],
	projectId: string,
	limit = 10,
): Promise<ProjectAgentTask[]> {
	return (await listProjectAgentTaskPage(ownerEmails, projectId, limit)).tasks;
}

export async function listProjectAgentTaskPage(
	ownerEmails: string[],
	projectId: string,
	limit = 10,
	cursor?: ProjectAgentTaskCursor,
	search?: string,
): Promise<{ tasks: ProjectAgentTask[]; nextCursor?: string }> {
	await migrateLegacyTasks();
	cleanupOldTasks().catch((error) => console.error("[project-agent] task cleanup failed", error));
	const page = await listStoredProjectAgentTasks(ownerEmails, projectId, Math.max(1, Math.min(limit, 20)), cursor, search);
	const last = page.tasks.at(-1);
	return {
		tasks: page.tasks,
		...(page.hasMore && last ? { nextCursor: encodeProjectAgentTaskCursor({ createdAt: last.createdAt, id: last.id }) } : {}),
	};
}

async function normalizeLegacyTask(task: ProjectAgentTask, filePath: string): Promise<ProjectAgentTask> {
	if (task.files?.length && !task.filesExpireAt) {
		const stat = await fs.stat(filePath).catch(() => null);
		if (stat) task.filesExpireAt = new Date(stat.mtimeMs + MAX_TASK_AGE_MS).toISOString();
	}
	return task;
}

async function migrateLegacyTasks(): Promise<void> {
	if (!legacyMigrationPromise) {
		legacyMigrationPromise = (async () => {
			const files = await fs.readdir(TASKS_DIR).catch(() => []);
			for (const file of files.filter((name) => /^pat_[a-f0-9]{12}\.json$/.test(name))) {
				const filePath = path.join(TASKS_DIR, file);
				const raw = await fs.readFile(filePath, "utf-8").catch(() => "");
				try {
					const task = await normalizeLegacyTask(JSON.parse(raw) as ProjectAgentTask, filePath);
					if (task.id && task.ownerEmail && task.projectId) await saveProjectAgentTask(task);
				} catch {
					// Ignore malformed legacy snapshots; Mongo remains authoritative.
				}
			}
		})();
		legacyMigrationPromise = legacyMigrationPromise.catch((error) => {
			legacyMigrationPromise = null;
			throw error;
		});
	}
	await legacyMigrationPromise;
}

export async function updateProjectAgentTask(
	taskId: string,
	patch: Partial<ProjectAgentTask> & { logLine?: string },
): Promise<ProjectAgentTask> {
	const { logLine, ...fields } = patch;
	const next = await patchProjectAgentTask(taskId, fields, logLine);
	await writeLegacySnapshot(next).catch(() => {});
	// The runtime's metrics line is written without waiting, so it can land just after the status: record again when it does.
	const finished = next.status === "done" || next.status === "failed";
	const metricsLate = finished && Boolean(logLine?.includes("metrics ::"));
	if (fields.status === "done" || fields.status === "failed" || metricsLate) {
		void recordFinishedTask(next);
		if (metricsLate || next.log.some((line) => line.includes("metrics ::"))) void scoreLessonTrials(next).catch(() => {});
	}
	return next;
}
/** Persist secondary receipts after guarded Mongo terminal CAS. */
export async function recordGuardedTerminalTask(task: ProjectAgentTask): Promise<void> {
  await writeLegacySnapshot(task).catch(() => {});
  void recordFinishedTask(task);
  if (task.log.some(line => line.includes("metrics ::"))) void scoreLessonTrials(task).catch(() => {});
}

export async function failStaleProjectAgentTask(task: ProjectAgentTask): Promise<ProjectAgentTask> {
	if (!isProjectAgentTaskStale(task)) return task;
	const message = "The web server stopped before this task finished. Please send the request again.";
	return updateProjectAgentTask(task.id, {
		status: "failed",
		completedAt: new Date().toISOString(),
		error: message,
		logLine: "failed: task stopped before completion",
	});
}

// Deletes a conversation and every local artifact (legacy JSON snapshot, files, inputs) so it cannot be re-imported.
export async function deleteProjectAgentConversation(
	projectId: string,
	ownerEmail: string,
	key: { conversationId?: string; taskId?: string },
): Promise<number> {
	const task = key.taskId ? await readProjectAgentTask(key.taskId).catch(() => null) : null;
	const ids = await deleteStoredProjectAgentConversation(projectId, ownerEmail, key);
	await Promise.all(ids.flatMap((id) => [
		fs.unlink(taskPath(id)).catch(() => {}),
		fs.rm(path.join(FILES_DIR, id), { recursive: true, force: true }).catch(() => {}),
		fs.rm(path.join(INPUTS_DIR, id), { recursive: true, force: true }).catch(() => {}),
	]));
	if (ids.length) await Promise.allSettled([...new Set([key.conversationId, task?.conversationId, key.taskId].filter((id): id is string => Boolean(id)))].map((chatId) => deleteContextScope({ projectId, chatId })));
	return ids.length;
}
