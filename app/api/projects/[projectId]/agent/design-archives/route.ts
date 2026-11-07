import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { listDesignArchives } from "@/lib/project-agent/design-archive-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
  if (auth.response) return auth.response;
  try {
    const versions = await listDesignArchives(params.projectId, auth.ownerEmail!);
    return NextResponse.json({ versions }, { headers: HEADERS });
  } catch {
    return NextResponse.json({ error: "CAD/BIM archive unavailable" }, { status: 503, headers: HEADERS });
  }
}
