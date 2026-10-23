import { promises as fs } from "node:fs";
import { createResourceFromFile } from "@/lib/workspace/resource-file-create";
import { LARGE_PDF_INPUT_BYTES } from "../large-input";
import { resolveBoard } from "./workspace-engine";

export interface LargeOutput { boardId: string; resourceId: string; size: number }

/** A PDF result above the download limit is stored by stream in the chat board's file library (versions, Range, tile viewer) instead of the 20 MiB task download. */
export async function isLargePdfOutput(absPath: string): Promise<boolean> {
	if (!/\.pdf$/i.test(absPath)) return false;
	const stat = await fs.stat(absPath).catch(() => null);
	return Boolean(stat?.isFile() && stat.size > LARGE_PDF_INPUT_BYTES);
}

export async function storeLargePdfOutput(chat: { chatId: string; ownerEmail: string; projectId?: string; boardId?: string }, absPath: string, name: string): Promise<LargeOutput> {
	const { board } = await resolveBoard(chat.chatId, chat.ownerEmail, { boardId: chat.boardId, projectId: chat.projectId, title: "Project Agent files" });
	const { id, size } = await createResourceFromFile(board.id, chat.ownerEmail, { filename: name, mimeType: "application/pdf", localPath: absPath });
	return { boardId: board.id, resourceId: id, size };
}
