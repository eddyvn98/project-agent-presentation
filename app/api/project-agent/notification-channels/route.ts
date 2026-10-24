import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { beginTelegramLink, unlinkTelegram, notificationLinkStatus } from "@/lib/project-agent/telegram-notifications";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const h = { "Cache-Control": "private, no-store" };
async function user(req: NextRequest) {
  const t = await getToken({ req });
  return typeof t?.email === "string" ? t.email.trim().toLowerCase() : "";
}
function origin(req: NextRequest) {
  try { return new URL(req.headers.get("origin") ?? "").origin === req.nextUrl.origin; }
  catch { return false; }
}
export async function GET(req: NextRequest) {
  const owner = await user(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: h });
  try { return NextResponse.json(await notificationLinkStatus(owner), { headers: h }); }
  catch { return NextResponse.json({ error: "Channel unavailable" }, { status: 503, headers: h }); }
}
export async function POST(req: NextRequest) {
  const owner = await user(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: h });
  if (!origin(req)) return NextResponse.json({ error: "Origin denied" }, { status: 403, headers: h });
  try { return NextResponse.json(await beginTelegramLink(owner), { headers: h }); }
  catch { return NextResponse.json({ error: "Telegram setup or encryption key unavailable" }, { status: 503, headers: h }); }
}
export async function DELETE(req: NextRequest) {
  const owner = await user(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: h });
  if (!origin(req)) return NextResponse.json({ error: "Origin denied" }, { status: 403, headers: h });
  try { await unlinkTelegram(owner); return NextResponse.json({ ok: true }, { headers: h }); }
  catch { return NextResponse.json({ error: "Could not revoke link" }, { status: 503, headers: h }); }
}
