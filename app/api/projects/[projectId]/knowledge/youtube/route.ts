import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import * as cap from "@/lib/capabilities/project";
import { indexProjectKnowledge } from "@/lib/vector-store";
import { fetchYoutubeTranscript } from "@/lib/youtube-transcript";
import { YoutubeTranscriptError } from "youtube-transcript";
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

  const { url } = (await req.json()) as { url?: string };
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  try {
    const { videoId, text } = await fetchYoutubeTranscript(url);
    const fileId = `kf_${randomUUID().replace(/-/g, "").slice(0, 7)}`;

    const kf: KnowledgeFile = {
      id: fileId,
      projectId,
      name: `YouTube: ${videoId}`,
      mimeType: "text/plain",
      fileType: "text",
      sizeBytes: Buffer.byteLength(text, "utf-8"),
      status: "ready",
      uploadedAt: Date.now(),
    };

    const result = await cap.addKnowledgeFile(projectId, ownerEmail, kf, text);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    indexProjectKnowledge(projectId, ownerEmail).catch(() => {});
    return NextResponse.json({ project: projectAccessView(result.data!, auth.access!) }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof YoutubeTranscriptError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("[knowledge youtube import] error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
