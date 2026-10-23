import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import * as cap from "@/lib/capabilities/project";
import { extractTextFromBuffer } from "@/lib/extract-knowledge";
import { describeImage } from "@/lib/describe-image";
import { indexProjectKnowledge } from "@/lib/vector-store";
import { resolveShareUrlToDriveItem, downloadDriveItemContent, streamDriveItemContent, GraphConfigError, GraphRequestError } from "@/lib/academy/microsoft-graph";
import type { KnowledgeFile } from "@/stores/useProjectStore";
import { canReadUserFiles, getValidAccessToken } from "@/lib/capabilities/onedrive-connection";
import { downloadUserDriveItem, getUserDriveItem, streamUserDriveItem, UserDriveError } from "@/lib/onedrive/user-drive";
import { projectAccessView, resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { cleanupExpiredLargeSources, LARGE_KNOWLEDGE_THRESHOLD, storeLargeKnowledgeStream } from "@/lib/project-knowledge-large-upload";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const { projectId } = params;
	const auth = await resolveProjectRequestAccess(req, projectId, "EDIT");
	if (auth.response) return auth.response;
	const ownerEmail = auth.ownerEmail!;

	const existing = await cap.getProject(projectId, ownerEmail);
  if (!existing.ok) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { shareUrl, itemId } = (await req.json()) as { shareUrl?: string; itemId?: string };
  if (!shareUrl && !itemId) return NextResponse.json({ error: "Missing shareUrl or itemId" }, { status: 400 });

  try {
    // itemId = a file from the caller's own OneDrive, fetched with their
    // delegated token; shareUrl = a shared link, fetched with the app token.
    let userToken: string | null = null;
    if (itemId) {
      if (!auth.callerEmail || !(await canReadUserFiles(auth.callerEmail))) {
        return NextResponse.json({ error: "Reconnect OneDrive to import your files", code: "RECONNECT_REQUIRED" }, { status: 403 });
      }
      userToken = await getValidAccessToken(auth.callerEmail);
      if (!userToken) return NextResponse.json({ error: "OneDrive session expired, reconnect", code: "RECONNECT_REQUIRED" }, { status: 401 });
    }
    const item = userToken && itemId
      ? await getUserDriveItem(userToken, itemId).then((entry) => {
        if (entry.isFolder) throw new UserDriveError("Folders cannot be imported", 400);
        return {
          driveId: "me",
          itemId: entry.id,
          name: entry.name,
          mimeType: entry.mimeType,
          sizeBytes: entry.sizeBytes,
        };
      })
      : await resolveShareUrlToDriveItem(shareUrl!);
    const filename = item.name || "onedrive-file";
    const mimeType = item.mimeType || "";
		if ((item.sizeBytes ?? 0) > LARGE_KNOWLEDGE_THRESHOLD) {
			await cleanupExpiredLargeSources();
			const response = userToken
				? await streamUserDriveItem(userToken, item.itemId)
				: await streamDriveItemContent(item.driveId, item.itemId);
			const stored = await storeLargeKnowledgeStream({
				name: filename,
				sizeBytes: item.sizeBytes!,
				stream: response.body as unknown as AsyncIterable<Uint8Array>,
			});
			const file: KnowledgeFile = {
				id: stored.fileId,
				projectId,
				name: stored.name,
				mimeType: mimeType || "application/octet-stream",
				fileType: "text",
				sizeBytes: stored.sizeBytes,
				status: "ready",
				isLargeSource: true,
				retentionExpiresAt: stored.expiresAt,
				uploadedAt: Date.now(),
			};
			const result = await cap.addKnowledgeFile(projectId, ownerEmail, file);
			if (!result.ok) {
				await cap.deleteKnowledgeOriginal(file.id, ownerEmail);
				return NextResponse.json({ error: result.error }, { status: 500 });
			}
			return NextResponse.json({ project: projectAccessView(result.data!, auth.access!) }, { status: 201 });
		}
		const buffer = userToken
			? await downloadUserDriveItem(userToken, item.itemId)
			: await downloadDriveItemContent(item.driveId, item.itemId);

    const { text, fileType, sections } = await extractTextFromBuffer(buffer, mimeType, filename);
    const fileId = `kf_${randomUUID().replace(/-/g, "").slice(0, 7)}`;

    let kf: KnowledgeFile;
    if (fileType === "image") {
      await cap.saveKnowledgeImage(fileId, buffer, mimeType || "image/png");
      kf = {
        id: fileId,
        projectId,
        name: filename,
        mimeType: mimeType || "image/png",
        fileType: "image",
        sizeBytes: buffer.length,
        status: "ready",
        uploadedAt: Date.now(),
      };
      const description = await describeImage(buffer, mimeType || "image/png", filename, auth.callerEmail!).catch(() => "");
      const result = await cap.addKnowledgeFile(projectId, ownerEmail, kf, description || undefined);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
      indexProjectKnowledge(projectId, ownerEmail).catch(() => {});
      return NextResponse.json({ project: projectAccessView(result.data!, auth.access!) }, { status: 201 });
    }

    kf = {
      id: fileId,
      projectId,
      name: filename,
      mimeType: mimeType || "application/octet-stream",
      fileType: "text",
      sizeBytes: buffer.length,
      status: "ready",
      uploadedAt: Date.now(),
    };
    const result = await cap.addKnowledgeFile(projectId, ownerEmail, kf, sections ?? text);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    indexProjectKnowledge(projectId, ownerEmail).catch(() => {});
    return NextResponse.json({ project: projectAccessView(result.data!, auth.access!) }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof GraphConfigError) {
      return NextResponse.json({ error: "OneDrive is not configured on this server" }, { status: 500 });
    }
    if (err instanceof UserDriveError) {
      return NextResponse.json({ error: "Could not access the OneDrive file" }, { status: [400, 404].includes(err.status) ? err.status : 502 });
    }
    if (err instanceof GraphRequestError) {
      return NextResponse.json({ error: "Could not access the OneDrive link" }, { status: err.status || 502 });
    }
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "UNSUPPORTED_TYPE") {
      return NextResponse.json({ error: (err as Error).message }, { status: 415 });
    }
    console.error("[knowledge onedrive import] error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
