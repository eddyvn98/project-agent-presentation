import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { classifyProjectAgentInputFile, inputFileMaxBytes } from "./task-inputs";
import { storeProjectAgentInputUpload } from "./input-upload-store";

/**
 * Stores one attachment sent as a raw request body (headers x-file-name, x-file-type) in the staging area of a project, owned by the caller.
 * Access to the project must already be checked. A later task create adopts the staged file by id.
 */
export async function receiveProjectAgentUpload(req: NextRequest, projectId: string, ownerEmail: string): Promise<NextResponse> {
	if (!req.body) return NextResponse.json({ error: "Attachment body is required" }, { status: 400 });
	let name = req.headers.get("x-file-name") ?? "";
	try { name = decodeURIComponent(name); } catch { return NextResponse.json({ error: "Invalid attachment name" }, { status: 400 }); }
	name = name.replace(/[\\/\r\n\0]/g, "_").slice(0, 200);
	const mimeType = req.headers.get("x-file-type") ?? "application/octet-stream";
	const declaredSize = Number(req.headers.get("content-length"));
	if (!name) return NextResponse.json({ error: "Attachment name is required" }, { status: 400 });
	const maxBytes = inputFileMaxBytes({ name, mimeType });
	if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
		return NextResponse.json({ error: `Attachment exceeds the ${maxBytes / 1024 / 1024} MiB per-file limit` }, { status: 413 });
	}
	let classified: ReturnType<typeof classifyProjectAgentInputFile>;
	try {
		classified = classifyProjectAgentInputFile({ name, type: mimeType });
	} catch (error) {
		return NextResponse.json({ error: error instanceof Error ? error.message : "Unsupported attachment format" }, { status: 415 });
	}
	const file = { id: randomUUID(), name, mimeType: classified.mimeType, size: 0 };
	try {
		const stored = await storeProjectAgentInputUpload({ ...file, projectId, ownerEmail }, req.body as unknown as AsyncIterable<Uint8Array>, maxBytes);
		return NextResponse.json({ file: stored }, { status: 201 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not store attachment";
		return NextResponse.json({ error: message }, { status: message.includes("limit") ? 413 : 400 });
	}
}
