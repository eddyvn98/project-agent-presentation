import path from "node:path";
import type { ProjectAgentTaskInputFile } from "./types";

/** PDFs above this size are not sent to the model provider or read into memory: they are staged in the sandbox and handled by the pdf action. */
export const LARGE_PDF_INPUT_BYTES = Number(process.env.PROJECT_AGENT_LARGE_PDF_BYTES) > 0 ? Number(process.env.PROJECT_AGENT_LARGE_PDF_BYTES) : 20 * 1024 * 1024;

export const isLargePdfInput = (file: Pick<ProjectAgentTaskInputFile, "name" | "mimeType" | "size">): boolean =>
	file.size > LARGE_PDF_INPUT_BYTES && (file.mimeType === "application/pdf" || /\.pdf$/i.test(file.name));

export const stagedInputName = (name: string): string => path.basename(name).replace(/[^\w.\- ()À-ỹ]/g, "_").slice(0, 160) || "file"; // vi-allow: keep accented file names
