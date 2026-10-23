import { NextRequest, NextResponse } from "next/server";
import * as cap from "@/lib/capabilities/project";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
  if (auth.response) return auth.response;

  const fileId = req.nextUrl.searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ error: "Missing fileId" }, { status: 400 });

  // readKnowledgeText() takes only a fileId and has no owner check of its
  // own — without this, any authenticated user could read any other user's
  // project text by guessing/enumerating fileId. Verifying fileId belongs
  // to a project actually owned by the caller closes that gap.
  const project = await cap.getProject(params.projectId, auth.ownerEmail!);
  if (!project.ok || !project.data || !project.data.knowledgeFiles.some((f) => f.id === fileId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const text = await cap.readKnowledgeText(fileId);
  if (text === null) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, max-age=60",
    },
  });
}
