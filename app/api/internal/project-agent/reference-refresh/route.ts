import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { webFetch } from "@/lib/project-agent/runtime/web-fetch";
import { webSearch } from "@/lib/project-agent/runtime/web-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const official = /(^|\.)(vanban\.chinhphu\.vn|vbpl\.vn|moc\.gov\.vn|xaydung\.gov\.vn|congbao\.chinhphu\.vn|iccsafe\.org|nfpa\.org|eurocodes\.jrc\.ec\.europa\.eu)$/i;

function authorized(request: NextRequest): boolean {
	const secret = process.env.PROJECT_AGENT_REFERENCE_CRON_SECRET;
	const header = request.headers.get("authorization") ?? "";
	if (!secret || secret.length < 32 || !header.startsWith("Bearer ")) return false;
	const supplied = Buffer.from(header.slice(7));
	const expected = Buffer.from(secret);
	return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request: NextRequest) {
	if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	let target: unknown;
	try { target = (await request.json()).target; } catch { return NextResponse.json({ error: "Expected JSON target" }, { status: 400 }); }
	if (typeof target !== "string" || !target.trim() || target.length > 500) return NextResponse.json({ error: "Invalid target" }, { status: 400 });
	try {
		if (/^https:\/\//i.test(target)) {
			const host = new URL(target).hostname;
			if (!official.test(host)) return NextResponse.json({ error: "Target is outside the official source allowlist" }, { status: 400 });
			const result = await webFetch(target);
			const finalUrl = result.sources?.[0]?.url ?? target;
			if (!official.test(new URL(finalUrl).hostname)) return NextResponse.json({ error: "Redirect left the official source allowlist" }, { status: 400 });
			return NextResponse.json({ url: finalUrl, text: result.text, error: result.failed ? result.text : undefined });
		}
		const result = await webSearch(target, undefined, { lang: "vi" });
		const sources = (result.sources ?? []).filter((source) => official.test(new URL(source.url).hostname)).slice(0, 3);
		const pages = await Promise.all(sources.map(async (source) => ({ url: source.url, result: await webFetch(source.url) })));
		const readable = pages.filter((page) => !page.result.failed);
		return NextResponse.json({ url: readable[0]?.url, text: readable.map((page) => page.result.text).join("\n\n"), error: readable.length ? undefined : "No readable official source found" });
	} catch (error) {
		console.error("[reference refresh] fetch failed", error);
		return NextResponse.json({ error: "Reference fetch failed" }, { status: 502 });
	}
}
