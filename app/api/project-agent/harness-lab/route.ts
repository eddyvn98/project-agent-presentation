import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { createHarnessVariant, listHarnessVariants, queueHarnessEvaluation,
  changeHarnessRollout, harnessOutcomeTotals, composeHarnessVariants } from "@/lib/project-agent/harness-lab/store";
import { proposeHarnessFromTrace, refineHarnessFromEvidence } from "@/lib/project-agent/harness-lab/propose";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
async function owner(req: NextRequest) {
  const token = await getToken({ req });
  return typeof token?.email === "string" ? token.email.trim().toLowerCase() : "";
}
const originOk = (req: NextRequest) => {
  try { return !!req.headers.get("origin") &&
    new URL(req.headers.get("origin")!).origin === req.nextUrl.origin; }
  catch { return false; }
};
export async function GET(req: NextRequest) {
  const account = await owner(req);
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: HEADERS });
  try {
    const variants = await listHarnessVariants(account);
    const counts = await Promise.all(variants.filter(v => v.status === "canary")
      .map(async v => ({ id: v.id, ...(await harnessOutcomeTotals(account, v.id)) })));
    return NextResponse.json({ variants, counts, enabled: process.env.PROJECT_AGENT_HARNESS_LAB === "1",
      liveEnabled: process.env.PROJECT_AGENT_HARNESS_LIVE === "1" }, { headers: HEADERS });
  } catch { return NextResponse.json({ error: "Harness Lab unavailable" }, { status: 503, headers: HEADERS }); }
}
export async function POST(req: NextRequest) {
  const account = await owner(req);
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: HEADERS });
  if (!originOk(req)) return NextResponse.json({ error: "Origin denied" }, { status: 403, headers: HEADERS });
  const input = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!input || typeof input.op !== "string") return NextResponse.json({ error: "Invalid operation" }, { status: 400, headers: HEADERS });
  try {
    if (input.op === "create") {
      const variant = await createHarnessVariant(account, {
        title: input.title as string, domain: input.domain as string,
        dimension: input.dimension as "approach" | "tools" | "delegation" | "skills",
        guidance: input.guidance as string,
        rationale: typeof input.rationale === "string" ? input.rationale : undefined,
        baselineId: typeof input.baselineId === "string" ? input.baselineId : undefined,
      });
      return NextResponse.json({ variant }, { status: 201, headers: HEADERS });
    }
    if (input.op === "compose") {
      if(typeof input.leftId!=="string" || typeof input.rightId!=="string")
        throw new Error("Choose two evaluated harness revisions");
      return NextResponse.json({ variant: await composeHarnessVariants(account,input.leftId,input.rightId) },
        { status:201, headers:HEADERS });
    }
    if (input.op === "refine") {
      if (process.env.PROJECT_AGENT_HARNESS_LAB !== "1" || typeof input.id !== "string")
        throw new Error("Select an evaluated variant in an enabled Lab");
      return NextResponse.json({ variant:await refineHarnessFromEvidence(account,input.id) },
        { status:201, headers:HEADERS });
    }
    if (input.op === "propose") {
      if (process.env.PROJECT_AGENT_HARNESS_LAB !== "1")
        throw new Error("Harness Lab is disabled on this server");
      if (typeof input.trace !== "string" || input.trace.length < 30 || input.trace.length > 2500)
        throw new Error("Describe an anonymized failure pattern (30–2500 characters)");
      const variant = await proposeHarnessFromTrace(account, input.domain as string, input.trace);
      return NextResponse.json({ variant }, { status: 201, headers: HEADERS });
    }
    const id = input.id;
    if (typeof id !== "string") throw new Error("A harness ID is required");
    if (input.op === "evaluate") {
      if (process.env.PROJECT_AGENT_HARNESS_LAB !== "1") throw new Error("Lab is disabled");
      return NextResponse.json({ variant: await queueHarnessEvaluation(account, id) }, { headers: HEADERS });
    }
    if (["canary","promote","rollback"].includes(input.op)) {
      if (process.env.PROJECT_AGENT_HARNESS_LIVE !== "1")
        throw new Error("Live rollout is disabled by the server administrator");
      return NextResponse.json({ variant: await changeHarnessRollout(account, id,
        input.op as "canary" | "promote" | "rollback") }, { headers: HEADERS });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400, headers: HEADERS });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Harness operation failed" },
      { status: 409, headers: HEADERS });
  }
}
