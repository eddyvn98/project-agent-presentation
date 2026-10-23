import type { ProjectAgentTaskFile } from "@/lib/project-agent/types";

const IMAGE_LINK = /!\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?[^)]*\)/g;
const baseName = (value: string) => decodeURIComponent(value.split(/[?#]/)[0]).split("/").pop()?.toLowerCase() ?? "";
const isRaster = (file: ProjectAgentTaskFile) => file.mimeType.startsWith("image/") && file.mimeType !== "image/svg+xml";
const isLocal = (src: string) => !/^(https?:|data:|blob:|\/)/i.test(src);

/** Images the agent placed in its text with ![caption](outputs/name.jpg): they show where the text puts them, so the gallery under the answer skips them. */
export function inlinedImageNames(markdown: string | undefined, files: ProjectAgentTaskFile[] | undefined): Set<string> {
	const names = new Set((files ?? []).filter(isRaster).map((file) => file.name.toLowerCase()));
	const used = new Set<string>();
	for (const [, src] of (markdown ?? "").matchAll(IMAGE_LINK)) if (isLocal(src) && names.has(baseName(src))) used.add(baseName(src));
	return used;
}

/** Turns a file name written in the answer into the URL of that file in the task; null when it is not a file of this task. */
export function resolveInlineImage(src: string, files: ProjectAgentTaskFile[] | undefined, urlOf: (file: ProjectAgentTaskFile) => string): string | null {
	if (!isLocal(src)) return null;
	const file = (files ?? []).find((item) => isRaster(item) && item.name.toLowerCase() === baseName(src));
	return file ? (file.savedToProjectFileId ? urlOf(file) : `${urlOf(file)}?preview=1`) : null;
}

export { isLocal as isLocalImageSource };
