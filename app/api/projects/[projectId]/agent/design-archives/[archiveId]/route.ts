import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { getDesignArchive } from "@/lib/project-agent/design-archive-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(req: NextRequest,
  { params }: { params: { projectId: string; archiveId: string } }) {
  const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
  if (auth.response) return auth.response;
  try {
    const version = await getDesignArchive(params.projectId, auth.ownerEmail!, params.archiveId);
    if (!version) return NextResponse.json({ error: "CAD/BIM version not found" },
      { status: 404, headers: HEADERS });
    return NextResponse.json({ version }, { headers: HEADERS });
  } catch {
    return NextResponse.json({ error: "CAD/BIM archive unavailable" }, { status: 503, headers: HEADERS });
  }
}
