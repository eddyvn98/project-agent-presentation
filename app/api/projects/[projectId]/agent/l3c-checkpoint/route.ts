import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { getProject } from "@/lib/capabilities/project";
import { recordContextCheckpoint, readContextCheckpoint } from "@/lib/project-agent/runtime/context-checkpoint";
import { deleteContextScope } from "@/lib/project-agent/runtime/context-output-store";
import { l3cQaAllowed } from "@/lib/project-agent/l3c-qa-guard.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const reply = (data: object, status = 200) => NextResponse.json(data, { status, headers });

async function authorized(req: NextRequest, projectId: string) {
  if (process.env.PROJECT_AGENT_L3C_QA_CHECKPOINT !== "1" ||
      process.env.PROJECT_AGENT_CONTEXT_CHECKPOINT_BACKEND !== "mongo" ||
      process.env.NODE_ENV === "production") return null;
  const access = await resolveProjectRequestAccess(req, projectId, "CHAT");
  if (access.response) return null;
  const project = await getProject(projectId, access.ownerEmail!);
  const chatId = "l3c_" + (process.env.G2_QA_RUN_ID ?? "");
  const allowed = project.ok && Boolean(project.data) && l3cQaAllowed({
    env: process.env, projectId, chatId, owner: access.ownerEmail!,
    caller: access.callerEmail!, projectName: project.data?.name ?? "",
    method: req.method, originHeader: req.headers.get("origin"), origin: req.nextUrl.origin,
  });
  return allowed ? { projectId, chatId, taskId: chatId } : null;
}
type Params = { params: { projectId: string } };
export async function GET(req: NextRequest, { params }: Params) {
  const scope = await authorized(req, params.projectId);
  if (!scope) return reply({ error: "Not found" }, 404);
  try {
    const checkpoint = await readContextCheckpoint(scope, scope.taskId);
    return reply({ checkpoint, recovered: checkpoint.includes("<app_context_checkpoint>") });
  } catch { return reply({ error: "Checkpoint unavailable" }, 503); }
}
export async function POST(req: NextRequest, { params }: Params) {
  const scope = await authorized(req, params.projectId);
  if (!scope) return reply({ error: "Not found" }, 404);
  const body = await req.json().catch(() => null) as { step?: unknown } | null;
  if (!Number.isSafeInteger(body?.step) || (body?.step as number) < 1 ||
      (body?.step as number) > 100) return reply({ error: "Invalid QA step" }, 400);
  try {
    const step = body!.step as number;
    await recordContextCheckpoint(scope, { taskId: scope.taskId, step,
      action: "l3c_synthetic", failed: false, observation: "verified QA step " + step });
    return reply({ saved: step });
  } catch { return reply({ error: "Checkpoint unavailable" }, 503); }
}
export async function DELETE(req: NextRequest, { params }: Params) {
  const scope = await authorized(req, params.projectId);
  if (!scope) return reply({ error: "Not found" }, 404);
  try {
    await deleteContextScope(scope);
    return reply({ deleted: true });
  } catch { return reply({ error: "QA cleanup failed" }, 503); }
}
