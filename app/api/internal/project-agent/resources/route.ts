import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processAgentResources } from "@/lib/project-agent/process-resources";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
export function authorizedDiagnostics(secret: string, candidate: string): boolean {
  if (Buffer.byteLength(secret) < 32 || Buffer.byteLength(secret) !== Buffer.byteLength(candidate)) return false;
  return timingSafeEqual(Buffer.from(secret), Buffer.from(candidate));
}
/** Operator-only, no user or task identifiers. */
export function GET(req: NextRequest) {
  if (!authorizedDiagnostics(process.env.PROJECT_AGENT_OPERATOR_DIAGNOSTICS_SECRET ?? "",
    req.headers.get("x-project-agent-operator-secret") ?? ""))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  return NextResponse.json({ resources: processAgentResources() }, { headers: noStore });
}
