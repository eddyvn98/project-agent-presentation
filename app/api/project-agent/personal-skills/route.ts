import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { listPersonalAgentSkills, upsertPersonalAgentSkill,
  togglePersonalAgentSkill, deletePersonalAgentSkill } from "@/lib/project-agent/personal-agent-skills";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function owner(req: NextRequest) {
  const token = await getToken({ req });
  return typeof token?.email === "string" ? token.email.toLowerCase().trim() : "";
}
function origin(req: NextRequest) {
  try { return new URL(req.headers.get("origin") || "").origin === req.nextUrl.origin; }
  catch { return false; }
}
export async function GET(req: NextRequest) {
  const user = await owner(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try { return NextResponse.json({ skills: await listPersonalAgentSkills(user) }, { headers }); }
  catch { return NextResponse.json({ error: "Skill Registry unavailable" }, { status: 503, headers }); }
}
async function mutate(req: NextRequest, operation: "upsert" | "toggle" | "delete") {
  const user = await owner(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!origin(req)) return NextResponse.json({ error: "Origin denied" }, { status: 403, headers });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid skill" }, { status: 400, headers });
  try {
    const skills = operation === "upsert"
      ? await upsertPersonalAgentSkill(user, body as Parameters<typeof upsertPersonalAgentSkill>[1])
      : operation === "toggle" && typeof body.id === "string" && typeof body.enabled === "boolean"
        ? await togglePersonalAgentSkill(user, body.id, body.enabled)
        : operation === "delete" && typeof body.id === "string"
          ? await deletePersonalAgentSkill(user, body.id) : null;
    if (!skills) throw new Error("Invalid mutation");
    return NextResponse.json({ skills }, { headers });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Skill change failed" }, { status: 409, headers }); }
}
export const POST = (req: NextRequest) => mutate(req, "upsert");
export const PATCH = (req: NextRequest) => mutate(req, "toggle");
export const DELETE = (req: NextRequest) => mutate(req, "delete");
