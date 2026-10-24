import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { listSchedules, acknowledgeScheduleRun } from "@/lib/project-agent/scheduled-store";
import { listWorkflowRuns, updateWorkflowRun } from "@/lib/project-agent/workflow-store";
import { listAgentApprovals } from "@/lib/project-agent/agent-approvals";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function identity(req: NextRequest) {
  const token = await getToken({ req });
  return typeof token?.email === "string" ? token.email.trim().toLowerCase() : "";
}
export async function GET(req: NextRequest) {
  const owner = await identity(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const [schedules, workflows, approvals] = await Promise.all([
      listSchedules(owner), listWorkflowRuns(owner), listAgentApprovals(owner),
    ]);
    const items = [
      ...schedules.flatMap(s => s.runs.filter(r => ["done","failed"].includes(r.status) &&
        !r.acknowledgedAt && !(s.spec.kind === "watch" && r.changed === false)).map(r => ({
        id: s.id + ":" + r.occurrence, category: "schedule", ownerId: s.id, occurrence: r.occurrence,
        title: s.title, message: r.summary || r.error || r.status,
        status: r.status, createdAt: r.completedAt ?? r.occurrence, href: "/account/scheduled-tasks",
      }))),
      ...workflows.filter(r => (r.status === "waiting_approval" ||
        ["done","failed"].includes(r.status) && !r.acknowledgedAt)).map(r => ({
        id: r.id, category: "workflow", ownerId: r.id, occurrence: "",
        title: "Workflow: " + r.workflowId, message: r.status === "waiting_approval" ?
          "A workflow step needs your approval" : r.error || "Workflow " + r.status,
        status: r.status, createdAt: r.updatedAt, href: "/account/agent-workflows",
      })),
      ...approvals.filter(a => a.state === "pending" && Date.parse(a.expiresAt) > Date.now())
        .map(a => ({
          id: a.id, category: "approval", ownerId: a.id, occurrence: "",
          title: "Website action: " + a.host, message: a.intent, status: a.state,
          createdAt: a.createdAt, href: "/account/agent-control",
        })),
    ].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
    return NextResponse.json({ notifications: items }, { headers });
  } catch { return NextResponse.json({ error: "Notifications unavailable" }, { status: 503, headers }); }
}
export async function PATCH(req: NextRequest) {
  const owner = await identity(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    if (new URL(req.headers.get("origin") || "").origin !== req.nextUrl.origin)
      return NextResponse.json({ error: "Origin denied" }, { status: 403, headers });
  } catch { return NextResponse.json({ error: "Origin required" }, { status: 403, headers }); }
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string" || !["schedule","workflow"].includes(String(body.category)))
    return NextResponse.json({ error: "Invalid notification" }, { status: 400, headers });
  try {
    if (body.category === "schedule" && typeof body.occurrence === "string")
      await acknowledgeScheduleRun(owner, body.id, body.occurrence);
    else if (body.category === "workflow")
      await updateWorkflowRun(owner, body.id, run => {
        if (!["done","failed"].includes(run.status)) throw new Error("Workflow not complete");
        run.acknowledgedAt = new Date().toISOString();
      });
    else throw new Error("Invalid receipt");
    return NextResponse.json({ ok: true }, { headers });
  } catch { return NextResponse.json({ error: "Could not acknowledge result" }, { status: 409, headers }); }
}
