import { NextRequest, NextResponse } from "next/server";
import * as cap from "@/lib/capabilities/project";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";

export const runtime = "nodejs";

export interface ProjectFileSearchHit { name: string; snippet: string }

// GET /api/projects/:projectId/search?q= — matches project file names and text content (case-insensitive substring)
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;
	const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
	if (q.length < 2) return NextResponse.json({ files: [] });
	const needle = q.toLowerCase();
	const hits = new Map<string, ProjectFileSearchHit>();

	const project = await cap.getProject(params.projectId, auth.ownerEmail!);
	for (const file of project.ok && project.data ? project.data.knowledgeFiles : []) {
		if (file.name.toLowerCase().includes(needle)) hits.set(file.name, { name: file.name, snippet: "File name matches" });
	}
	const { textChunks } = await cap.getProjectKnowledgeContext(params.projectId, auth.ownerEmail!);
	for (const chunk of textChunks) {
		if (hits.size >= 20) break;
		const lineEnd = chunk.indexOf("\n");
		const firstLine = lineEnd < 0 ? "" : chunk.slice(0, lineEnd);
		if (!firstLine.startsWith("[File: ") || !firstLine.endsWith("]")) continue;
		const body = chunk.slice(lineEnd + 1);
		const index = body.toLowerCase().indexOf(needle);
		if (index < 0) continue;
		const name = firstLine.slice(7, -1).split(" > ")[0];
		if (hits.get(name)?.snippet && hits.get(name)!.snippet !== "File name matches") continue;
		const start = Math.max(0, index - 60);
		const snippet = `${start > 0 ? "…" : ""}${body.slice(start, index + needle.length + 100).replace(/\s+/g, " ").trim()}…`;
		hits.set(name, { name, snippet });
	}
	return NextResponse.json({ files: [...hits.values()] });
}
