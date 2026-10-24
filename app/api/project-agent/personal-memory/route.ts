import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { readPersonalAgentMemory, setPersonalMemoryEnabled, addPersonalMemoryFact, deletePersonalMemoryFact } from "@/lib/project-agent/personal-agent-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function user(req: NextRequest) {
  const token = await getToken({ req });
  return typeof token?.email === "string" ? token.email.toLowerCase().trim() : "";
}
function checkOrigin(req: NextRequest) {
  try { return new URL(req.headers.get("origin") || "").origin === req.nextUrl.origin; }
  catch { return false; }
}
export async function GET(req: NextRequest) {
  const owner = await user(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try { return NextResponse.json({ memory: await readPersonalAgentMemory(owner) }, { headers }); }
  catch { return NextResponse.json({ error: "Memory key or storage unavailable" }, { status: 503, headers }); }
}
export async function POST(req: NextRequest) {
  const owner = await user(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!checkOrigin(req)) return NextResponse.json({ error: "Origin denied" }, { status: 403, headers });
  const body = await req.json().catch(() => null) as { text?: unknown; category?: unknown } | null;
  if (typeof body?.text !== "string")
    return NextResponse.json({ error: "Memory text required" }, { status: 400, headers });
  try {
    const category = ["preference","workflow","context"].includes(String(body.category)) ?
      body.category as "preference" | "workflow" | "context" : "preference";
    return NextResponse.json({ memory: await addPersonalMemoryFact(owner, body.text, category) }, { headers });
  } catch { return NextResponse.json({ error: "Could not save memory" }, { status: 409, headers }); }
}
export async function PATCH(req: NextRequest) {
  const owner = await user(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!checkOrigin(req)) return NextResponse.json({ error: "Origin denied" }, { status: 403, headers });
  const body = await req.json().catch(() => null) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean")
    return NextResponse.json({ error: "enabled must be boolean" }, { status: 400, headers });
  try { return NextResponse.json({ memory: await setPersonalMemoryEnabled(owner, body.enabled) }, { headers }); }
  catch { return NextResponse.json({ error: "Memory unavailable" }, { status: 503, headers }); }
}
export async function DELETE(req: NextRequest) {
  const owner = await user(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!checkOrigin(req)) return NextResponse.json({ error: "Origin denied" }, { status: 403, headers });
  const body = await req.json().catch(() => null) as { id?: unknown } | null;
  if (typeof body?.id !== "string") return NextResponse.json({ error: "Memory id required" }, { status: 400, headers });
  try { return NextResponse.json({ memory: await deletePersonalMemoryFact(owner, body.id) }, { headers }); }
  catch { return NextResponse.json({ error: "Could not delete memory" }, { status: 409, headers }); }
}
