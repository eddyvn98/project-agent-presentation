import { NextRequest, NextResponse } from "next/server";
import { readProjectAgentFile, readProjectAgentTask } from "@/lib/project-agent/task-store";
import { buildProjectAgentFileHeaders, inferProjectAgentFileMetadata } from "@/lib/project-agent/files";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { listProjectConversationMembers } from "@/lib/capabilities/project-sharing";
import { canAccessProjectAgentTask } from "@/lib/project-agent/access";
import { OFFICE_PDF_PREVIEW_EXTENSIONS, officePdfResponse } from "@/lib/project-agent/office-pdf-response";
import { renderProjectAgentFile } from "@/lib/project-agent/visual-review";
import { parseByteRange } from "@/lib/project-agent/byte-range";

export const runtime = "nodejs";

export async function GET(
	req: NextRequest,
	{ params }: { params: { projectId: string; taskId: string; fileId: string } },
) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;
	const members = await listProjectConversationMembers(params.projectId, auth.callerEmail!);
	const task = await readProjectAgentTask(params.taskId);
	if (!task || !members || !canAccessProjectAgentTask(task, params.projectId, auth.ownerEmail!, members)) {
		return NextResponse.json({ error: "Task not found" }, { status: 404 });
	}
	const file = task.files?.find((item) => item.id === params.fileId);
	if (file?.resource) return NextResponse.redirect(new URL(`/api/workspaces/${encodeURIComponent(file.resource.boardId)}/resources/${encodeURIComponent(file.resource.resourceId)}`, req.url), 307);
	if (task.filesExpireAt && Date.parse(task.filesExpireAt) <= Date.now()) {
		return NextResponse.json({ error: "File link expired" }, { status: 410 });
	}
	if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
	const content = await readProjectAgentFile(task.id, file.id).catch(() => null);
	if (!content) return NextResponse.json({ error: "File not found" }, { status: 404 });
	const metadata = inferProjectAgentFileMetadata(file.name, file.mimeType, content);
	const normalizedFile = { ...file, ...metadata, size: content.byteLength };
	if (req.nextUrl.searchParams.get("pdf") === "1" && OFFICE_PDF_PREVIEW_EXTENSIONS.has(file.name.split(".").pop()?.toLowerCase() ?? "")) return officePdfResponse(content, file.name);
	if (req.nextUrl.searchParams.get("rendered") === "1") {
		try {
			const preview = await renderProjectAgentFile(normalizedFile, content);
			return new NextResponse(new Uint8Array(preview.bytes), {
				headers: {
					"Content-Type": "image/png",
					"Content-Disposition": "inline",
					"Cache-Control": "private, no-store",
					"X-Content-Type-Options": "nosniff",
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Could not render this file";
			return NextResponse.json({ error: message.slice(0, 240) }, { status: 422 });
		}
	}
	const preview = req.nextUrl.searchParams.get("preview") === "1";
	const headers = buildProjectAgentFileHeaders(normalizedFile, preview, req.nextUrl.searchParams.get("run") === "1");
	if (!/pdf/i.test(String(headers["Content-Type"] ?? normalizedFile.mimeType))) return new NextResponse(new Uint8Array(content), { headers });
	// PDFs are served in ranges so the viewer can paint the first pages of a large drawing set before the rest has arrived.
	const range = parseByteRange(req.headers.get("range"), content.byteLength);
	if (range === "invalid") return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${content.byteLength}` } });
	if (!range) return new NextResponse(new Uint8Array(content), { headers: { ...headers, "Accept-Ranges": "bytes" } });
	return new NextResponse(new Uint8Array(content.subarray(range.start, range.end + 1)), {
		status: 206, headers: { ...headers, "Accept-Ranges": "bytes", "Content-Range": `bytes ${range.start}-${range.end}/${content.byteLength}`, "Content-Length": String(range.end - range.start + 1) },
	});
}
