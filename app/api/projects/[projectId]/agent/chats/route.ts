import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { deleteProjectAgentConversation } from "@/lib/project-agent/task-store";
import {
	listProjectAgentConversationStatuses,
	patchProjectAgentConversation,
} from "@/services/mongodb/projectAgentTasks.repo";

export const runtime = "nodejs";

function keyFrom(input: { conversationId?: unknown; taskId?: unknown }): { conversationId?: string; taskId?: string } | null {
	if (typeof input.conversationId === "string" && input.conversationId) return { conversationId: input.conversationId };
	if (typeof input.taskId === "string" && input.taskId) return { taskId: input.taskId };
	return null;
}

// PATCH /api/projects/:projectId/agent/chats — { conversationId | taskId, title?, pinned? } (owner's own chats only)
export async function PATCH(req: NextRequest, { params }: { params: { projectId: string } }) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;
	const body = await req.json().catch(() => ({})) as { conversationId?: unknown; taskId?: unknown; title?: unknown; pinned?: unknown; moveToProjectId?: unknown };
	const key = keyFrom(body);
	if (!key) return NextResponse.json({ error: "Missing chat id" }, { status: 400 });
	const fields: { chatTitle?: string; chatPinned?: boolean; projectId?: string; projectOwnerEmail?: string } = {};
	if (typeof body.moveToProjectId === "string" && body.moveToProjectId && body.moveToProjectId !== params.projectId) {
		const target = await resolveProjectRequestAccess(req, body.moveToProjectId, "CHAT");
		if (target.response) return target.response;
		fields.projectId = body.moveToProjectId;
		fields.projectOwnerEmail = target.ownerEmail!;
	}
	if (typeof body.title === "string") {
		const title = body.title.replace(/\s+/g, " ").trim().slice(0, 200);
		if (!title) return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
		fields.chatTitle = title;
	}
	if (typeof body.pinned === "boolean") fields.chatPinned = body.pinned;
	if (Object.keys(fields).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
	const matched = await patchProjectAgentConversation(params.projectId, auth.callerEmail!, key, fields);
	if (!matched) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
	return NextResponse.json({ ok: true, ...fields });
}

// DELETE /api/projects/:projectId/agent/chats?conversationId=… | ?taskId=…
export async function DELETE(req: NextRequest, { params }: { params: { projectId: string } }) {
	const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
	if (auth.response) return auth.response;
	const key = keyFrom({
		conversationId: req.nextUrl.searchParams.get("conversationId") ?? undefined,
		taskId: req.nextUrl.searchParams.get("taskId") ?? undefined,
	});
	if (!key) return NextResponse.json({ error: "Missing chat id" }, { status: 400 });
	const statuses = await listProjectAgentConversationStatuses(params.projectId, auth.callerEmail!, key);
	if (statuses.length === 0) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
	if (statuses.some((status) => status !== "done" && status !== "failed")) {
		return NextResponse.json({ error: "This chat is still running. Try again when it finishes." }, { status: 409 });
	}
	await deleteProjectAgentConversation(params.projectId, auth.callerEmail!, key);
	return NextResponse.json({ ok: true });
}
