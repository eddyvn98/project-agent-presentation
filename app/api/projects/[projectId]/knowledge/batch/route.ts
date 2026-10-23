import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import * as cap from "@/lib/capabilities/project";
import { extractTextFromBuffer } from "@/lib/extract-knowledge";
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
	const ownerEmail = auth.ownerEmail!;

	const existing = await cap.getProject(projectId, ownerEmail);
  if (!existing.ok) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];
  if (files.length === 0) return NextResponse.json({ error: "No files provided" }, { status: 400 });

  // Extract text from all files in parallel (CPU-bound, safe to parallelize)
  const results = await Promise.allSettled(
    files.map(async (file) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mimeType = file.type || "application/octet-stream";
      const fileId = `kf_${randomUUID().replace(/-/g, "").slice(0, 7)}`;
      const { text, fileType, sections } = await extractTextFromBuffer(buffer, mimeType, file.name);

      const kf: KnowledgeFile = {
        id: fileId,
        projectId,
        name: file.name,
        mimeType,
        fileType,
        sizeBytes: file.size,
        status: "ready",
        uploadedAt: Date.now(),
      };

      return {
        kf,
        text: fileType === "text" ? (sections ?? text) : undefined,
        imageBuffer: fileType === "image" ? buffer : undefined,
        originalBuffer: fileType === "text" ? buffer : undefined,
      };
    }),
  );

  const succeeded: cap.BatchKnowledgeItem[] = [];
  const errors: { name: string; error: string }[] = [];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      succeeded.push(result.value);
    } else {
      errors.push({
        name: files[i].name,
        error: result.reason instanceof Error ? result.reason.message : "Extraction failed",
      });
    }
  });

  if (succeeded.length === 0) {
    return NextResponse.json({ errors }, { status: 422 });
  }

  // Single atomic write for all succeeded files
  const batchResult = await cap.addKnowledgeFilesBatch(projectId, ownerEmail, succeeded);
  if (!batchResult.ok) {
    return NextResponse.json({ error: batchResult.error }, { status: 500 });
  }

  // Re-index vector store asynchronously (don't block response)
  indexProjectKnowledge(projectId, ownerEmail).catch(() => {});

  return NextResponse.json(
	    { project: projectAccessView(batchResult.data!, auth.access!), errors },
    { status: errors.length > 0 ? 207 : 201 },
  );
}
