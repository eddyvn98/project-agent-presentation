import { NextRequest, NextResponse } from "next/server";
import * as projectCap from "@/lib/capabilities/project";
import { buildProjectAgentFileHeaders } from "@/lib/project-agent/files";
import { OFFICE_PDF_PREVIEW_EXTENSIONS, officePdfResponse } from "@/lib/project-agent/office-pdf-response";
import { renderProjectAgentFile } from "@/lib/project-agent/visual-review";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;
	const project = await projectCap.getProject(params.projectId, auth.ownerEmail!);
	if (!project.ok || !project.data) return NextResponse.json({ error: "Project not found" }, { status: 404 });
	const fileId = req.nextUrl.searchParams.get("fileId");
	const file = project.data.knowledgeFiles.find((item) => item.id === fileId);
	if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
	const stored = file.fileType === "image"
		? await projectCap.readKnowledgeImage(file.id)
		: await projectCap.readKnowledgeOriginal(file.id);
	if (!stored) return NextResponse.json({ error: "Original file not found" }, { status: 404 });
	const buffer = stored.buffer;
	if (req.nextUrl.searchParams.get("pdf") === "1" && OFFICE_PDF_PREVIEW_EXTENSIONS.has(file.name.split(".").pop()?.toLowerCase() ?? "")) return officePdfResponse(buffer, file.name);
	if (req.nextUrl.searchParams.get("rendered") === "1") {
		try {
			const rendered = await renderProjectAgentFile(file, buffer);
			return new NextResponse(new Uint8Array(rendered.bytes), {
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
	return new NextResponse(new Uint8Array(buffer), {
		headers: buildProjectAgentFileHeaders({ name: file.name, mimeType: file.mimeType, size: buffer.byteLength }, preview, req.nextUrl.searchParams.get("run") === "1"),
	});
}
