import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { listBrowserPolicies, listBrowserSecurityAudit, setBrowserPolicy, type BrowserPolicyMode } from "@/lib/project-agent/browser-security-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function owner(req: NextRequest) {
  const session = await getToken({ req });
  return typeof session?.email === "string" ? session.email.trim().toLowerCase() : "";
}
function originOK(req: NextRequest) {
  try { return new URL(req.headers.get("origin") || "").origin === req.nextUrl.origin; }
  catch { return false; }
}
export async function GET(req: NextRequest) {
  const email = await owner(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try { return NextResponse.json({ policies: await listBrowserPolicies(email), audit: await listBrowserSecurityAudit(email) }, { headers }); }
  catch { return NextResponse.json({ error: "Policy store unavailable" }, { status: 503, headers }); }
}
export async function PUT(req: NextRequest) {
  const email = await owner(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!originOK(req)) return NextResponse.json({ error: "Origin denied" }, { status: 403, headers });
  const body = await req.json().catch(() => null) as { hostname?: unknown; mode?: unknown } | null;
  if (typeof body?.hostname !== "string" || body.hostname.length > 255 ||
    !["inherit","read","interact","deny"].includes(String(body.mode)))
    return NextResponse.json({ error: "Invalid browser policy" }, { status: 400, headers });
  try {
    const policy = await setBrowserPolicy(email, body.hostname, body.mode as BrowserPolicyMode);
    return NextResponse.json({ policy }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Policy update failed" },
      { status: 409, headers });
  }
}
