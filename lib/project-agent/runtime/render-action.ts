import fs from "node:fs/promises";
import path from "node:path";
import type { DifyChatFile } from "../dify-input-files";
import { renderFileId } from "../render-ids";
import { writeProjectAgentFile } from "../task-store";
import { uploadRuntimeImage } from "./model";
import { checkHtmlPage } from "./outputs";
import { RENDER_SCRIPT } from "./render-script";
import type { RenderRegion } from "./actions";
import { execInSandbox, resolveWorkspacePath, workspaceDir } from "./sandbox";

export async function render(chatId: string, taskId: string | undefined, user: string, relative: string, pages: "sample" | number[], counter: number, region?: RenderRegion): Promise<{ text: string; image?: DifyChatFile }> {
	if (/\.html?$/i.test(relative)) return { text: await checkHtmlPage(chatId, relative) };
	const root = workspaceDir(chatId);
	await fs.mkdir(path.join(root, ".tools"), { recursive: true });
	await fs.writeFile(path.join(root, ".tools", "render.py"), RENDER_SCRIPT);
	const source = `/work/${path.relative(root, resolveWorkspacePath(chatId, relative))}`;
	const sheet = `.render/sheet-${counter}.png`;
	const result = await execInSandbox(chatId, `mkdir -p /work/.render && python3 /work/.tools/render.py ${JSON.stringify(source)} /work/${sheet} ${JSON.stringify(pages === "sample" ? "sample" : JSON.stringify(pages))} ${JSON.stringify(region ? JSON.stringify(region) : "")}`, 220);
	if (result.exitCode !== 0) return { text: `Render failed (exit ${result.exitCode}):\n${result.output}` };
	const bytes = await fs.readFile(resolveWorkspacePath(chatId, sheet));
	if (taskId) await writeProjectAgentFile(taskId, renderFileId(counter), bytes).catch(() => {});
	return { text: `Rendered ${relative}: ${result.output.trim()}. The page image is attached (pages in order, left to right, top to bottom).`, image: await uploadRuntimeImage(`${path.basename(relative)}-pages`, bytes, user) };
}
