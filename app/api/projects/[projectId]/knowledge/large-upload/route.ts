import { reconcileAutoSkillSources } from "@/lib/project-agent/auto-skills/worker";
import { NextRequest, NextResponse } from "next/server";
import * as cap from "@/lib/capabilities/project";
import type { KnowledgeFile } from "@/stores/useProjectStore";
import { projectAccessView, resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { cancelLargeUpload, cleanupExpiredLargeSources, cleanupExpiredLargeUploads, createLargeUploadSession, finalizeLargeUpload, getLargeUploadSession, LARGE_UPLOAD_CHUNK_BYTES, writeLargeUploadChunk } from "@/lib/project-knowledge-large-upload";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "EDIT");
	if (auth.response) return auth.response;
	const body = await req.json().catch(() => null) as { name?: string; mimeType?: string; sizeBytes?: number } | null;
	if (!body?.name || !Number.isSafeInteger(body.sizeBytes)) return NextResponse.json({ error: "Invalid large-file upload metadata" }, { status: 400 });
	try {
		await Promise.all([cleanupExpiredLargeUploads(), cleanupExpiredLargeSources()]);
		const session = await createLargeUploadSession({
			projectId: params.projectId,
			ownerEmail: auth.ownerEmail!,
			name: body.name,
			mimeType: body.mimeType || "application/octet-stream",
			sizeBytes: body.sizeBytes!,
		});
		return NextResponse.json({ sessionId: session.id, chunkBytes: LARGE_UPLOAD_CHUNK_BYTES, chunkCount: session.chunkCount });
	} catch (error) {
		return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start upload" }, { status: 413 });
	}
}

export async function PUT(req: NextRequest, { params }: { params: { projectId: string } }) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "EDIT");
	if (auth.response) return auth.response;
	const sessionId = req.nextUrl.searchParams.get("sessionId") ?? "";
	const index = Number(req.nextUrl.searchParams.get("chunk"));
	const session = await getLargeUploadSession(sessionId);
	if (!session || session.projectId !== params.projectId || session.ownerEmail !== auth.ownerEmail) return NextResponse.json({ error: "Upload session not found" }, { status: 404 });
	try {
		const bytes = Buffer.from(await req.arrayBuffer());
		const written = await writeLargeUploadChunk(sessionId, auth.ownerEmail!, index, bytes);
		if (!written.complete) return NextResponse.json({ complete: false, receivedChunks: written.session.received.filter(Boolean).length });
		const finalized = await finalizeLargeUpload(sessionId, auth.ownerEmail!);
		const file: KnowledgeFile = {
			id: finalized.session.fileId,
			projectId: params.projectId,
			name: finalized.session.name,
			mimeType: finalized.session.mimeType,
			fileType: "text",
			sizeBytes: finalized.session.sizeBytes,
			status: "ready",
			isLargeSource: true,
			retentionExpiresAt: finalized.expiresAt,
			uploadedAt: Date.now(),
		};
		const result = await cap.addKnowledgeFile(params.projectId, auth.ownerEmail!, file);
		if (!result.ok) {
			await cap.deleteKnowledgeOriginal(file.id, auth.ownerEmail!);
			return NextResponse.json({ error: result.error }, { status: 500 });
		}
		await reconcileAutoSkillSources(params.projectId, auth.ownerEmail!).catch(() => {});
		return NextResponse.json({ complete: true, project: projectAccessView(result.data!, auth.access!) }, { status: 201 });
	} catch (error) {
		return NextResponse.json({ error: error instanceof Error ? error.message : "Could not store upload chunk" }, { status: 400 });
	}
}

export async function DELETE(req: NextRequest, { params }: { params: { projectId: string } }) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "EDIT");
	if (auth.response) return auth.response;
	const sessionId = req.nextUrl.searchParams.get("sessionId") ?? "";
	const session = await getLargeUploadSession(sessionId);
	if (session?.projectId === params.projectId && session.ownerEmail === auth.ownerEmail) await cancelLargeUpload(sessionId, auth.ownerEmail!);
	return NextResponse.json({ ok: true });
}
