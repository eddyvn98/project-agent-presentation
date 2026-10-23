import { NextRequest, NextResponse } from "next/server";
import { readProjectAgentTask, updateProjectAgentTask } from "@/lib/project-agent/task-store";
import { MAX_STEER_CHARS, MAX_STEER_NOTES } from "@/lib/project-agent/runtime/steer";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";

export const runtime = "nodejs";

// POST /api/projects/:projectId/agent/tasks/:taskId/steer {text} — owner only; the running agent reads the note before its next step
export async function POST(req: NextRequest, { params }: { params: { projectId: string; taskId: string } }) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;
	const body = await req.json().catch(() => ({})) as { text?: unknown };
	const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_STEER_CHARS) : "";
	if (!text) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
	const task = await readProjectAgentTask(params.taskId);
	if (!task || task.projectId !== params.projectId || task.ownerEmail.trim().toLowerCase() !== auth.callerEmail!.trim().toLowerCase()) {
		return NextResponse.json({ error: "Task not found" }, { status: 404 });
	}
	if (task.status !== "running" && task.status !== "queued") return NextResponse.json({ error: "This task has already finished; send it as a new message." }, { status: 409 });
	const notes = task.steerNotes ?? [];
	if (notes.length >= MAX_STEER_NOTES) return NextResponse.json({ error: "Too many added messages for one task; wait for the next step or queue it." }, { status: 429 });
	await updateProjectAgentTask(task.id, { steerNotes: [...notes, text], logLine: `user added a message (${text.length} characters)` });
	return NextResponse.json({ ok: true });
}
