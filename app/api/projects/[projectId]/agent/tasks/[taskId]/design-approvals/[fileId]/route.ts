import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { listProjectConversationMembers } from "@/lib/capabilities/project-sharing";
import { readProjectAgentFile, readProjectAgentTask } from "@/lib/project-agent/task-store";
import { canAccessProjectAgentTask } from "@/lib/project-agent/access";
import { decideDesignApproval, getDesignApprovalState } from "@/lib/project-agent/design-approval-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store" };
type Params = { projectId: string; taskId: string; fileId: string };

async function resolveSource(req: NextRequest, params: Params, write: boolean) {
  const auth = await resolveProjectRequestAccess(req, params.projectId, write ? "EDIT" : "CHAT");
  if (auth.response) return { error: auth.response };
  if (write && auth.callerEmail?.toLowerCase() !== auth.ownerEmail?.toLowerCase())
    return { error: NextResponse.json({ error: "Only the Project owner can approve CAD/BIM releases" },
      { status: 403, headers: HEADERS }) };
  const members = await listProjectConversationMembers(params.projectId, auth.callerEmail!);
  const task = await readProjectAgentTask(params.taskId);
  if (!task || !members || !canAccessProjectAgentTask(task, params.projectId, auth.ownerEmail!, members))
    return { error: NextResponse.json({ error: "Task not found" }, { status: 404, headers: HEADERS }) };
  if (task.status !== "done")
    return { error: NextResponse.json({ error: "Design task is not complete" }, { status: 409, headers: HEADERS }) };
  const file = task.files?.find(f => f.id === params.fileId);
  if (!file || !/^design-[a-f0-9]{12}\.design\.json$/.test(file.name))
    return { error: NextResponse.json({ error: "Design source not found" }, { status: 404, headers: HEADERS }) };
  const bytes = await readProjectAgentFile(task.id, file.id).catch(() => null);
  if (!bytes) return { error: NextResponse.json({ error: "Source unavailable" }, { status: 410, headers: HEADERS }) };
  return { bytes: Buffer.from(bytes), reviewer: auth.callerEmail! };
}
export async function GET(req: NextRequest, { params }: { params: Params }) {
  const source = await resolveSource(req, params, false);
  if ("error" in source) return source.error;
  try {
    const result = await getDesignApprovalState({
      projectId: params.projectId, taskId: params.taskId,
      sourceFileId: params.fileId, bytes: source.bytes!,
    });
    return NextResponse.json(result, {
      status: "error" in result ? 422 : 200, headers: HEADERS,
    });
  } catch {
    return NextResponse.json({ error: "Approval state unavailable" }, { status: 503, headers: HEADERS });
  }
}
export async function POST(req: NextRequest, { params }: { params: Params }) {
  const origin = req.headers.get("origin");
  if (!origin || (() => { try { return new URL(origin).origin !== req.nextUrl.origin; }
    catch { return true; } })()) return NextResponse.json(
      { error: "Origin denied" }, { status: 403, headers: HEADERS });
  const source = await resolveSource(req, params, true);
  if ("error" in source) return source.error;
  const data = await req.json().catch(() => null) as { approve?: unknown; sha256?: unknown } | null;
  if (typeof data?.approve !== "boolean" || typeof data.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(data.sha256))
    return NextResponse.json({ error: "Invalid human approval decision" }, { status: 400, headers: HEADERS });
  try {
    const inspected = await getDesignApprovalState({
      projectId: params.projectId, taskId: params.taskId,
      sourceFileId: params.fileId, bytes: source.bytes!,
    });
    if ("error" in inspected) return NextResponse.json(inspected, { status: 422, headers: HEADERS });
    if (inspected.sha256 !== data.sha256)
      return NextResponse.json({ error: "Design changed since review; reload and inspect again" },
        { status: 409, headers: HEADERS });
    const decision = await decideDesignApproval({
      projectId: params.projectId, taskId: params.taskId,
      sourceFileId: params.fileId, bytes: source.bytes!,
      reviewer: source.reviewer!, approve: data.approve,
    });
    return NextResponse.json(decision, { status: "error" in decision ? 422 : 201, headers: HEADERS });
  } catch {
    return NextResponse.json({ error: "Could not record approval" }, { status: 503, headers: HEADERS });
  }
}
