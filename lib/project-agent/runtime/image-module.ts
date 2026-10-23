import fs from "node:fs/promises";
import sharp from "sharp";
import path from "node:path";
import { resolveDifyChatEndpoint } from "@/app/config/difyEndpointResolver";
import { readGeneratedImageUrls } from "@/app/workspace/utils/workspaceImageGeneration";
import { buildImageDifyInputs } from "@/lib/image-dify-inputs";
import type { ImagePayloadInputs } from "@/types/image-generation.types";
import { uploadProjectAgentReviewFile, type DifyChatFile } from "../dify-input-files";
import { createUsageStreamObserver } from "@/lib/ai-usage/server/usage-recorder";
import { uploadRuntimeImage } from "./model";
import { resolveWorkspacePath } from "./sandbox";

export interface ImageRequest { prompt: string; aspectRatio?: string; resolution?: string; model?: string; count?: number; references?: string[] }

const MAX_REFERENCES = 3;

/** Feeds a copy of the generator stream to the AI usage recorder without delaying the agent. */
function recordImageUsage(response: Response, email: string, difyUser: string, url: string): void {
	if (!response.ok || !response.body) return;
	const observer = createUsageStreamObserver({ email, difyUser, category: "IMAGE_KEY", feature: "project-agent-image", difyUrl: url }, response.headers.get("content-type"));
	void (async () => {
		try {
			const reader = response.clone().body!.getReader();
			for (;;) { const { done, value } = await reader.read(); if (done) break; observer.onBytes(value); }
			observer.finish("complete");
		} catch { observer.finish("error"); }
	})();
}
const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

/** Runs the Workspace Image Generator (its own Dify app) for the agent and saves the results under /work/outputs/generated. */
export async function generateImages(chatId: string, user: string, request: ImageRequest, signal?: AbortSignal, ownerEmail?: string): Promise<{ text: string; images?: DifyChatFile[]; failed?: boolean }> {
	const endpoint = resolveDifyChatEndpoint("IMAGE_KEY");
	if (!endpoint.apiKey || !endpoint.url) return { text: "The image generator is not configured on this server.", failed: true };
	try {
		const files = [];
		for (const reference of (request.references ?? []).slice(0, MAX_REFERENCES)) {
			const bytes = await fs.readFile(resolveWorkspacePath(chatId, reference));
			files.push(await uploadProjectAgentReviewFile({ name: path.basename(reference), mimeType: /\.jpe?g$/i.test(reference) ? "image/jpeg" : "image/png" }, bytes, user, endpoint.url, endpoint.apiKey, true));
		}
		const inputs: ImagePayloadInputs = { model: (request.model || "Auto") as ImagePayloadInputs["model"], aspect_ratio: request.aspectRatio || "1:1", resolution: (request.resolution || "1K") as ImagePayloadInputs["resolution"], seed: "Random", custom_seed: 0, enhance_prompt: "Yes", image_count: Math.max(1, Math.min(4, Math.round(request.count ?? 1))) };
		const response = await fetch(endpoint.url, {
			method: "POST",
			headers: { Authorization: `Bearer ${endpoint.apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({ inputs: buildImageDifyInputs(inputs), query: request.prompt, response_mode: "streaming", user, files }),
			cache: "no-store",
			signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(300_000)]) : AbortSignal.timeout(300_000),
		});
		if (ownerEmail) recordImageUsage(response, ownerEmail, user, endpoint.url);
		const urls = await readGeneratedImageUrls(response, () => {});
		if (!urls.length) return { text: "The image generator returned no images. Try a different prompt.", failed: true };
		const directory = resolveWorkspacePath(chatId, "outputs/generated");
		await fs.mkdir(directory, { recursive: true });
		const saved: string[] = [];
		const views: DifyChatFile[] = [];
		for (const [index, url] of urls.slice(0, inputs.image_count ?? 1).entries()) {
			const download: Response = await fetch(new URL(url, endpoint.url), { cache: "no-store", signal: AbortSignal.timeout(60_000) });
			const type = download.headers.get("content-type")?.split(";")[0] ?? "";
			if (!download.ok || !EXTENSIONS[type]) continue;
			const name = `image-${Date.now()}-${index + 1}.${EXTENSIONS[type]}`;
			const bytes = Buffer.from(await download.arrayBuffer());
			await fs.writeFile(path.join(directory, name), bytes);
			const preview = await sharp(bytes).resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer().catch(() => null);
			if (preview) { const view = await uploadRuntimeImage(name, preview, user, "image/jpeg").catch(() => null); if (view) views.push(view); }
			saved.push(`/work/outputs/generated/${name}`);
		}
		return saved.length ? { text: `Generated ${saved.length} image(s):\n${saved.join("\n")}\nThe images are attached to this message in the same order. Look at them against the request (subject, composition, style, text, proportions). If they miss it, call generate_image again with a better prompt, a different aspect ratio or model, or references before finishing; if they match, list them in the final action's files to deliver them, or use them in a document.`, images: views } : { text: "The generated images could not be downloaded.", failed: true };
	} catch (cause) { return { text: `generate_image failed: ${cause instanceof Error ? cause.message : "error"}`, failed: true }; }
}
