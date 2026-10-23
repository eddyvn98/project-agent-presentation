import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import * as cap from "@/lib/capabilities/project";
import { extractTextFromBuffer } from "@/lib/extract-knowledge";
import { describeImage } from "@/lib/describe-image";
import { indexProjectKnowledge } from "@/lib/vector-store";
import type { KnowledgeFile } from "@/stores/useProjectStore";
import { projectAccessView, resolveProjectRequestAccess } from "@/lib/projects/api-access";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const { projectId } = params;
	const auth = await resolveProjectRequestAccess(req, projectId, "EDIT");
	if (auth.response) return auth.response;

	const existing = await cap.getProject(projectId, auth.ownerEmail!);
  if (!existing.ok) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const fileId = `kf_${randomUUID().replace(/-/g, "").slice(0, 7)}`;

  let kf: KnowledgeFile;

  try {
    const { text, fileType, sections } = await extractTextFromBuffer(buffer, mimeType, file.name);

    if (fileType === "image") {
      // Store image in project knowledge storage
      await cap.saveKnowledgeImage(fileId, buffer, mimeType);

      kf = {
        id: fileId,
        projectId,
        name: file.name,
        mimeType,
        fileType: "image",
        sizeBytes: file.size,
        status: "ready",
        uploadedAt: Date.now(),
      };

      // Best-effort: describe the image via Dify so its content is searchable
      // like any other knowledge file. A failure here must not block upload.
      const description = await describeImage(buffer, mimeType, file.name, auth.callerEmail!).catch(() => "");

      const result = await cap.addKnowledgeFile(projectId, auth.ownerEmail!, kf, description || undefined);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
      indexProjectKnowledge(projectId, auth.ownerEmail!).catch(() => {});
      return NextResponse.json({ project: projectAccessView(result.data!, auth.access!) }, { status: 201 });
    } else {
      kf = {
        id: fileId,
        projectId,
        name: file.name,
        mimeType,
        fileType: "text",
        sizeBytes: file.size,
        status: "ready",
        uploadedAt: Date.now(),
      };

      const result = await cap.addKnowledgeFile(projectId, auth.ownerEmail!, kf, sections ?? text, buffer);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
      indexProjectKnowledge(projectId, auth.ownerEmail!).catch(() => {});
      return NextResponse.json({ project: projectAccessView(result.data!, auth.access!) }, { status: 201 });
    }
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "UNSUPPORTED_TYPE") {
      return NextResponse.json({ error: (err as Error).message }, { status: 415 });
    }
    console.error("[knowledge upload] error:", err);
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const { projectId } = params;
	const auth = await resolveProjectRequestAccess(req, projectId, "EDIT");
	if (auth.response) return auth.response;
  const fileId = new URL(req.url).searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ error: "Missing fileId" }, { status: 400 });

  const result = await cap.removeKnowledgeFile(projectId, fileId, auth.ownerEmail!);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });

  // Rebuild vector index after file removal (async)
  indexProjectKnowledge(projectId, auth.ownerEmail!).catch(() => {});

  return NextResponse.json({ project: projectAccessView(result.data!, auth.access!) });
}
