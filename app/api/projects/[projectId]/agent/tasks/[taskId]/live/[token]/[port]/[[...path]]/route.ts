import { NextRequest, NextResponse } from "next/server";
import { sandboxKeyOf } from "@/lib/project-agent/live-preview/access";
import { canRewrite, rewriteLocation, rewriteRootPaths } from "@/lib/project-agent/live-preview/rewrite";
import { forwardToSandbox } from "@/lib/project-agent/live-preview/tunnel";
import { isLivePort, verifyLiveToken } from "@/lib/project-agent/live-preview/token";
import { readProjectAgentTask } from "@/lib/project-agent/task-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { projectId: string; taskId: string; token: string; port: string };
const PASS_REQUEST_HEADERS = ["accept", "accept-language", "content-type", "range", "user-agent"];
const DROP_RESPONSE_HEADERS = new Set(["content-security-policy", "content-security-policy-report-only", "x-frame-options", "cache-control", "etag", "last-modified", "content-encoding", "access-control-allow-origin"]);
/** The page gets an opaque origin: no cookies, no storage and no access to the app, whatever the sandboxed server sends. */
const FRAME_POLICY = "sandbox allow-scripts allow-forms allow-popups allow-modals allow-presentation allow-downloads";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS", "Access-Control-Allow-Headers": "*" };
const text = (message: string, status: number) => new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...CORS } });

async function handle(req: NextRequest, { params }: { params: Params }) {
	const port = Number(params.port);
	if (!isLivePort(port) || !verifyLiveToken(params.token, params.projectId, params.taskId, port)) return text("This preview link is invalid or has expired. Reopen it from the chat.", 403);
	if (req.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: CORS });
	const task = await readProjectAgentTask(params.taskId);
	if (!task || task.projectId !== params.projectId) return text("Task not found", 404);
	const base = `/api/projects/${encodeURIComponent(params.projectId)}/agent/tasks/${encodeURIComponent(params.taskId)}/live/${params.token}/${port}`;
	const upstreamPath = (req.nextUrl.pathname.slice(req.nextUrl.pathname.indexOf(`/live/${params.token}/${port}`) + `/live/${params.token}/${port}`.length) || "/") + req.nextUrl.search;
	const headers: Record<string, string> = {};
	for (const name of PASS_REQUEST_HEADERS) { const value = req.headers.get(name); if (value) headers[name] = value; }
	const body = req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.from(await req.arrayBuffer());
	try {
		const upstream = await forwardToSandbox(sandboxKeyOf(task), port, { method: req.method, path: upstreamPath, headers, body }, req.signal);
		const out = new Headers(CORS);
		let contentType: string | null = null;
		for (const [key, value] of upstream.headers) {
			const lower = key.toLowerCase();
			if (lower === "content-type") contentType = value;
			if (DROP_RESPONSE_HEADERS.has(lower)) continue;
			out.append(key, lower === "location" ? rewriteLocation(value, base) : value);
		}
		out.set("Cache-Control", "no-store");
		out.set("Content-Security-Policy", FRAME_POLICY);
		out.set("X-Content-Type-Options", "nosniff");
		if (req.method === "HEAD") return new NextResponse(null, { status: upstream.status, headers: out });
		if (canRewrite(contentType, 0)) {
			const buffered = Buffer.from(await new Response(upstream.body).arrayBuffer());
			if (canRewrite(contentType, buffered.byteLength)) return new NextResponse(rewriteRootPaths(buffered.toString("utf8"), base), { status: upstream.status, headers: out });
			return new NextResponse(new Uint8Array(buffered), { status: upstream.status, headers: out });
		}
		return new NextResponse(upstream.body, { status: upstream.status, headers: out });
	} catch (error) {
		return text(error instanceof Error ? error.message : "Live preview failed", 502);
	}
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as HEAD, handle as OPTIONS };
