import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { exportBoardContent } from "@/lib/workspace/board-export-import";
import { DEFAULT_CAMERA } from "@/app/workspace/types/camera";
import { resolveAccessRole } from "@/app/api/workspaces/_access";
import { resolveWorkspacePath } from "./sandbox";

export interface WorkspaceRequest { title?: string; boardId?: string; /** Project the new board belongs to when it has to be created. */ projectId?: string }
const STATE_FILE = ".engine/workspace.json";

async function savedBoardId(chatId: string): Promise<string | null> {
	try { return String(JSON.parse(await fs.readFile(resolveWorkspacePath(chatId, STATE_FILE), "utf8")).boardId || "") || null; } catch { return null; }
}

async function rememberBoard(chatId: string, boardId: string) {
	const file = resolveWorkspacePath(chatId, STATE_FILE);
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, JSON.stringify({ boardId }));
}

/** The chat's Workspace board: the one the agent used before, a board the agent names (owner or collaborator), or a new empty board owned by the task owner. */
export async function accessibleBoard(id: string | null | undefined, email: string) {
	const board = id ? await prisma.workspaceBoard.findUnique({ where: { id } }) : null;
	return board && await resolveAccessRole(board, email) ? board : null;
}

/** The chat's board if it already exists and the user may open it; never creates one. */
export async function existingChatBoard(chatId: string, ownerEmail: string) {
	return accessibleBoard(await savedBoardId(chatId), ownerEmail);
}

export async function resolveBoard(chatId: string, ownerEmail: string, request: WorkspaceRequest) {
	const existing = await accessibleBoard(request.boardId?.trim() || await savedBoardId(chatId), ownerEmail);
	if (existing) return { board: existing, created: false };
	const board = await prisma.workspaceBoard.create({ data: { id: randomUUID(), ownerEmail, ...(request.projectId ? { projectId: request.projectId } : {}), title: (request.title?.trim() || "Project Agent board").slice(0, 120), blocks: {}, blockOrder: [], connectors: [], camera: { ...DEFAULT_CAMERA } } });
	await rememberBoard(chatId, board.id);
	return { board, created: true };
}

export function boardLinks(boardId: string, board: { blocks: unknown }, focus: string[]): string {
	const blocks = (board.blocks ?? {}) as Record<string, { type?: string }>;
	const lines = [`Board: /workspace?id=${boardId}`];
	for (const id of focus.slice(0, 5)) if (blocks[id]?.type === "doc") lines.push(`Document editor: /workspace/doc-editor?boardId=${boardId}&docId=${encodeURIComponent(id)}`);
	return lines.join("\n");
}

export function workspaceServiceKey(): string | undefined {
	return process.env.NODE_ENV === "production" ? process.env.WORKSPACE_AGENT_SERVICE_KEY : process.env.WORKSPACE_AGENT_SERVICE_KEY_LOCAL || process.env.WORKSPACE_AGENT_SERVICE_KEY;
}

/** The board's current content as Markdown, saved to /work/workspace-board.md (after the user's edits too); convert it with pandoc for docx or pdf deliverables. */
export async function workspaceRead(chatId: string, ownerEmail: string, request: { boardId?: string }): Promise<{ text: string; failed?: boolean }> {
	const board = await accessibleBoard(request.boardId?.trim() || await savedBoardId(chatId), ownerEmail);
	if (!board) return { text: `There is no Workspace board in this chat yet. Call workspace_view to create it, then fill it with workspace_apply.`, failed: true };
	const exported = exportBoardContent(board, "markdown", undefined);
	if (!exported.ok) return { text: exported.error, failed: true };
	await fs.writeFile(resolveWorkspacePath(chatId, "workspace-board.md"), exported.export.content);
	return { text: `Board "${board.title}" (${exported.export.blockCount} blocks) saved to /work/workspace-board.md. First 3000 characters:\n${exported.export.content.slice(0, 3000)}` };
}
