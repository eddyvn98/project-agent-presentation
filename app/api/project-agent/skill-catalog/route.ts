import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { SAFE_AGENT_SKILL_CATALOG, skillCatalogEntry } from "@/lib/project-agent/skill-catalog";
import { upsertPersonalAgentSkill } from "@/lib/project-agent/personal-agent-skills";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const h = { "Cache-Control": "private, no-store" };
export async function GET() {
  return NextResponse.json({ catalog: SAFE_AGENT_SKILL_CATALOG.map(({ instructions: _text, ...item }) => item) }, { headers: h });
}
export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  const owner = typeof token?.email === "string" ? token.email.trim().toLowerCase() : "";
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: h });
  try { if (new URL(req.headers.get("origin") || "").origin !== req.nextUrl.origin)
    return NextResponse.json({ error: "Origin denied" }, { status: 403, headers: h }); }
  catch { return NextResponse.json({ error: "Origin required" }, { status: 403, headers: h }); }
  const body = await req.json().catch(() => null) as { id?: unknown } | null;
  const skill = typeof body?.id === "string" ? skillCatalogEntry(body.id) : null;
  if (!skill) return NextResponse.json({ error: "Unknown catalog skill" }, { status: 400, headers: h });
  try {
    const list = await upsertPersonalAgentSkill(owner, { name: skill.name,
      description: skill.description, instructions: skill.instructions, enabled: false });
    return NextResponse.json({ skills: list }, { headers: h });
  } catch { return NextResponse.json({ error: "Could not add skill" }, { status: 409, headers: h }); }
}
