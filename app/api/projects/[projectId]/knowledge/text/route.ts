import { NextRequest, NextResponse } from "next/server";
import * as cap from "@/lib/capabilities/project";
import { projectAccessView, resolveProjectRequestAccess } from "@/lib/projects/api-access";

export const runtime = "nodejs";
const MAX_CHARS = 100_000;

async function findEditable(req: NextRequest, projectId: string, fileId: string | null, level: "CHAT" | "EDIT") {
	const auth = await resolveProjectRequestAccess(req, projectId, level);
	if (auth.response) return { response: auth.response };
	const project = await cap.getProject(projectId, auth.ownerEmail!);
	const file = project.ok ? project.data?.knowledgeFiles.find((entry) => entry.id === fileId) : undefined;
	if (!project.ok || !project.data || !file) return { response: NextResponse.json({ error: "Source not found" }, { status: 404 }) };
	if (file.fileType !== "text" || (!file.origin && !file.managed)) return { response: NextResponse.json({ error: "Only agent-written sources can be edited here" }, { status: 400 }) };
	return { auth, project: project.data, file };
}

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
	const found = await findEditable(req, params.projectId, req.nextUrl.searchParams.get("fileId"), "CHAT");
	if (found.response) return found.response;
	return NextResponse.json({ text: (await cap.readKnowledgeText(found.file!.id)) ?? "" });
}

export async function PUT(req: NextRequest, { params }: { params: { projectId: string } }) {
	const body = await req.json().catch(() => ({})) as { fileId?: string; text?: string; name?: string };
	if (typeof body.text !== "string" || body.text.length > MAX_CHARS) return NextResponse.json({ error: "Invalid text" }, { status: 400 });
	const found = await findEditable(req, params.projectId, body.fileId ?? null, "EDIT");
	if (found.response) return found.response;
	await cap.saveKnowledgeText(found.file!.id, body.text);
	const name = found.file!.managed ? found.file!.name : body.name?.trim().slice(0, 160) || found.file!.name;
	const updated = await cap.updateProject(params.projectId, found.auth!.ownerEmail!, {
		knowledgeFiles: found.project!.knowledgeFiles.map((entry) => entry.id === found.file!.id ? { ...entry, name, sizeBytes: Buffer.byteLength(body.text!) } : entry),
	});
	if (!updated.ok || !updated.data) return NextResponse.json({ error: "Could not save" }, { status: 500 });
	return NextResponse.json({ project: projectAccessView(updated.data, found.auth!.access!) });
}
