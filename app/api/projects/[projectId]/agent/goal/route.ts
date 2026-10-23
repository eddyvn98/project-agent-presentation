import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { deleteGoal, loadGoal, saveGoal } from "@/lib/project-agent/goal-store";

export const runtime = "nodejs";

const keyOf = (req: NextRequest) => req.nextUrl.searchParams.get("conversationId")?.trim() || "";

async function ownGoal(req: NextRequest, projectId: string) {
	const auth = await resolveProjectRequestAccess(req, projectId, "CHAT");
	if (auth.response) return { response: auth.response };
	const key = keyOf(req);
	const goal = key ? await loadGoal(key) : null;
	if (goal && (goal.projectId !== projectId || goal.ownerEmail.toLowerCase() !== auth.callerEmail!.toLowerCase())) return { response: NextResponse.json({ goal: null }) };
	return { key, goal };
}

/** The goal of a chat: shown as a bar above the composer. */
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
	const found = await ownGoal(req, params.projectId);
	return found.response ?? NextResponse.json({ goal: found.goal ?? null });
}

/** Pause, resume or clear the goal. Resuming starts no work by itself: the next message (or /goal) continues. */
export async function PATCH(req: NextRequest, { params }: { params: { projectId: string } }) {
	const found = await ownGoal(req, params.projectId);
	if (found.response) return found.response;
	if (!found.goal || !found.key) return NextResponse.json({ error: "No goal on this chat" }, { status: 404 });
	const action = ((await req.json().catch(() => ({}))) as { action?: unknown }).action;
	if (action === "clear") { await deleteGoal(found.key); return NextResponse.json({ goal: null }); }
	if (action === "pause" && found.goal.status === "active") return NextResponse.json({ goal: await saveGoal(found.key, { ...found.goal, status: "paused", note: "Paused by you." }) });
	if (action === "resume" && found.goal.status !== "done") return NextResponse.json({ goal: await saveGoal(found.key, { ...found.goal, status: "active", turnsUsed: Math.min(found.goal.turnsUsed, Math.max(found.goal.maxTurns - 1, 0)), stalledRounds: 0, note: "Resumed. The goal is checked after your next message." }) });
	return NextResponse.json({ error: "Unknown or unavailable action" }, { status: 400 });
}
