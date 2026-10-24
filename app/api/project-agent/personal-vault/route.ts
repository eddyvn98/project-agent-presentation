import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { listPersonalBrowserGrants, revokePersonalBrowserGrant, updatePersonalBrowserGrant } from "@/lib/project-agent/runtime/browser-agent/personal-vault";
import { closeBrowserSessionsForOwnerHost } from "@/lib/project-agent/runtime/browser-agent/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

async function caller(req: NextRequest) {
  const token = await getToken({ req });
  const email = typeof token?.email === "string" ? token.email.trim().toLowerCase() : "";
  return email || null; // Never permit development auth fallback for a credential vault.
}
function originOk(req: NextRequest) {
  const source = req.headers.get("origin");
  return !!source && (() => { try { return new URL(source).origin === req.nextUrl.origin; } catch { return false; } })();
}
export async function GET(req: NextRequest) {
  const email = await caller(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: HEADERS });
  try { return NextResponse.json({ sites: await listPersonalBrowserGrants(email) }, { headers: HEADERS }); }
  catch { return NextResponse.json({ error: "Vault unavailable" }, { status: 503, headers: HEADERS }); }
}
export async function PATCH(req: NextRequest) {
  const email = await caller(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: HEADERS });
  if (!originOk(req)) return NextResponse.json({ error: "Origin denied" }, { status: 403, headers: HEADERS });
  const body = await req.json().catch(() => null) as { url?: unknown; mode?: unknown; automation?: unknown } | null;
  if (typeof body?.url !== "string" || body.url.length > 500 ||
    !["read","interact"].includes(String(body.mode)) || typeof body.automation !== "boolean")
    return NextResponse.json({ error: "Invalid permission update" }, { status: 400, headers: HEADERS });
  try {
    const grant = await updatePersonalBrowserGrant(email, body.url, body.mode as "read" | "interact", body.automation);
    await closeBrowserSessionsForOwnerHost(email, grant.host);
    return NextResponse.json({ grant }, { headers: HEADERS });
  } catch { return NextResponse.json({ error: "Could not update website permission" }, { status: 409, headers: HEADERS }); }
}
export async function DELETE(req: NextRequest) {
  const email = await caller(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: HEADERS });
  if (!originOk(req)) return NextResponse.json({ error: "Origin denied" }, { status: 403, headers: HEADERS });
  const body = await req.json().catch(() => null) as { url?: unknown } | null;
  if (typeof body?.url !== "string" || body.url.length > 500)
    return NextResponse.json({ error: "Invalid website URL" }, { status: 400, headers: HEADERS });
  try {
    const { vaultHost } = await import("@/lib/project-agent/runtime/browser-agent/personal-vault");
    const host = vaultHost(body.url);
    await revokePersonalBrowserGrant(email, body.url);
    await closeBrowserSessionsForOwnerHost(email, host);
    return NextResponse.json({ ok: true }, { headers: HEADERS });
  } catch { return NextResponse.json({ error: "Could not revoke website" }, { status: 409, headers: HEADERS }); }
}
