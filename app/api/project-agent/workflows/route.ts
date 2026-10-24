import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import * as projectCap from "@/lib/capabilities/project";
import { listAgentWorkflows, listWorkflowRuns, saveAgentWorkflow, changeAgentWorkflow } from "@/lib/project-agent/workflow-store";
import { launchWorkflow, approveWorkflowStep, rejectWorkflowStep } from "@/lib/project-agent/workflow-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
async function email(req: NextRequest) {
  const token = await getToken({ req });
  return typeof token?.email === "string" ? token.email.trim().toLowerCase() : "";
}
function originOk(req: NextRequest) {
  try { return new URL(req.headers.get("origin") || "").origin === req.nextUrl.origin; }
  catch { return false; }
}
export async function GET(req: NextRequest) {
  const owner = await email(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const [workflows, runs] = await Promise.all([listAgentWorkflows(owner), listWorkflowRuns(owner)]);
    return NextResponse.json({ workflows, runs: runs.slice(0, 100) }, { headers });
  } catch { return NextResponse.json({ error: "Workflow storage unavailable" }, { status: 503, headers }); }
}
export async function POST(req: NextRequest) {
  const owner = await email(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!originOk(req)) return NextResponse.json({ error: "Origin denied" }, { status: 403, headers });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.projectId !== "string" ||
    !await projectCap.getProjectAccess(body.projectId, owner))
    return NextResponse.json({ error: "Project not accessible" }, { status: 403, headers });
  try {
    const workflow = await saveAgentWorkflow(owner,
      body as Parameters<typeof saveAgentWorkflow>[1]);
    return NextResponse.json({ workflow }, { status: 201, headers });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Invalid workflow" }, { status: 400, headers }); }
}
export async function PATCH(req: NextRequest) {
  const owner = await email(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!originOk(req)) return NextResponse.json({ error: "Origin denied" }, { status: 403, headers });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string" ||
    !["enable","disable","delete","run","approve_step","reject_step"].includes(String(body.action)))
    return NextResponse.json({ error: "Invalid workflow action" }, { status: 400, headers });
  try {
    if (body.action === "run")
      return NextResponse.json(await launchWorkflow(owner, body.id), { headers });
    if (body.action === "approve_step")
      return NextResponse.json(await approveWorkflowStep(owner, body.id), { headers });
    if (body.action === "reject_step")
      return NextResponse.json({ run: await rejectWorkflowStep(owner, body.id) }, { headers });
    const workflow = await changeAgentWorkflow(owner, body.id,
      body.action as "enable" | "disable" | "delete");
    return NextResponse.json({ workflow }, { headers });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Workflow unavailable" }, { status: 409, headers }); }
}
