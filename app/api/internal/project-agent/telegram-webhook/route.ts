import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { completeTelegramLink } from "@/lib/project-agent/telegram-notifications";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const expected = process.env.PROJECT_AGENT_TELEGRAM_WEBHOOK_SECRET ?? "";
  const candidate = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (expected.length < 32 || Buffer.byteLength(expected) !== Buffer.byteLength(candidate) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(candidate)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as { message?: {
    text?: unknown; chat?: { id?: unknown; type?: unknown } } } | null;
  const chat = body?.message?.chat;
  const code = typeof body?.message?.text === "string" ?
    body.message.text.trim().match(/^\/start(?:@\w+)?\s+(pa_[a-f0-9]{48})$/i)?.[1] : "";
  if (code && (chat?.type === "private") && typeof chat.id === "number" && Number.isSafeInteger(chat.id))
    await completeTelegramLink(code, String(chat.id));
  return NextResponse.json({ ok: true });
}
