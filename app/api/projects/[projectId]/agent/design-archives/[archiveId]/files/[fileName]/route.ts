import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { readArchivedDesignFile } from "@/lib/project-agent/design-archive-store";
import { buildProjectAgentFileHeaders } from "@/lib/project-agent/files";
import { parseByteRange } from "@/lib/project-agent/byte-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NAME = /^design-[a-f0-9]{12}\.(design\.json|pdf|dxf|glb|preview\.png|web\.html|ifc)$/;
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(req: NextRequest, { params }: { params: {
  projectId: string; archiveId: string; fileName: string;
} }) {
  const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
  if (auth.response) return auth.response;
  if (!NAME.test(params.fileName))
    return NextResponse.json({ error: "File not found" }, { status: 404, headers: HEADERS });
  try {
    const item = await readArchivedDesignFile(params.projectId, auth.ownerEmail!,
      params.archiveId, params.fileName);
    if (!item) return NextResponse.json({ error: "Archived file not found" },
      { status: 404, headers: HEADERS });
    const { file, bytes } = item;
    const preview = req.nextUrl.searchParams.get("preview") === "1";
    const headers = buildProjectAgentFileHeaders(file, preview,
      preview && req.nextUrl.searchParams.get("run") === "1");
    if (!file.name.endsWith(".pdf")) return new NextResponse(new Uint8Array(bytes), { headers });
    const range = parseByteRange(req.headers.get("range"), bytes.byteLength);
    if (range === "invalid") return new NextResponse(null, { status: 416,
      headers: { ...HEADERS, "Content-Range": `bytes */${bytes.byteLength}` } });
    if (!range) return new NextResponse(new Uint8Array(bytes),
      { headers: { ...headers, "Accept-Ranges": "bytes" } });
    return new NextResponse(new Uint8Array(bytes.subarray(range.start, range.end + 1)), {
      status: 206, headers: { ...headers, "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${range.start}-${range.end}/${bytes.length}`,
        "Content-Length": String(range.end - range.start + 1) },
    });
  } catch {
    return NextResponse.json({ error: "Archive integrity check failed or archive unavailable" },
      { status: 503, headers: HEADERS });
  }
}
