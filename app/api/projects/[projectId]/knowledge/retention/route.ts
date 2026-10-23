import { NextRequest, NextResponse } from "next/server";
import * as cap from "@/lib/capabilities/project";
import { projectAccessView, resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { LARGE_SOURCE_RETENTION_MS } from "@/lib/project-knowledge-large-upload";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "EDIT");
	if (auth.response) return auth.response;
	const { fileId } = await req.json().catch(() => ({})) as { fileId?: string };
	const result = await cap.getProject(params.projectId, auth.ownerEmail!);
	if (!result.ok || !result.data) return NextResponse.json({ error: "Project not found" }, { status: 404 });
	const file = result.data.knowledgeFiles.find((entry) => entry.id === fileId && entry.isLargeSource);
	if (!file || !fileId) return NextResponse.json({ error: "Large source not found" }, { status: 404 });
	const retentionExpiresAt = Date.now() + LARGE_SOURCE_RETENTION_MS;
	try {
		await cap.extendKnowledgeOriginalRetention(file.id, retentionExpiresAt);
	} catch {
		return NextResponse.json({ error: "Source has expired or is no longer stored" }, { status: 410 });
	}
	const updated = await cap.updateProject(params.projectId, auth.ownerEmail!, {
		knowledgeFiles: result.data.knowledgeFiles.map((entry) => entry.id === file.id ? { ...entry, retentionExpiresAt } : entry),
	});
	if (!updated.ok || !updated.data) return NextResponse.json({ error: "Could not update source retention" }, { status: 500 });
	return NextResponse.json({ project: projectAccessView(updated.data, auth.access!), retentionExpiresAt });
}
