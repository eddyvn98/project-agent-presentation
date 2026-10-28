import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { findProjectBrowser, openProjectBrowser, stopProjectBrowser,
  projectBrowserOperation, projectBrowserStatus } from "@/lib/project-agent/runtime/browser-agent/project-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer" };
type Params = { params: { projectId: string } };
async function authorize(req: NextRequest, projectId: string) {
  const auth = await resolveProjectRequestAccess(req, projectId, "CHAT");
  if (auth.response) return { response: auth.response };
  if (!auth.callerEmail)
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: HEADERS }) };
  if (process.env.PROJECT_AGENT_RUNTIME !== "sandbox" ||
      process.env.PROJECT_AGENT_STEEL_BROWSER !== "1")
    return { response: NextResponse.json({ error: "Steel browser not enabled" },
      { status: 409, headers: HEADERS }) };
  return { owner: auth.callerEmail.trim().toLowerCase() };
}
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === req.nextUrl.origin; }
  catch { return false; }
}
export async function GET(req: NextRequest, { params }: Params) {
  const checked = await authorize(req, params.projectId);
  if (checked.response) return checked.response;
  const session = await findProjectBrowser(params.projectId, checked.owner!);
  return NextResponse.json(session ? await projectBrowserStatus(session, params.projectId) : { connected: false },
    { headers: HEADERS });
}
export async function POST(req: NextRequest, { params }: Params) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-origin control denied" },
    { status: 403, headers: HEADERS });
  const checked = await authorize(req, params.projectId);
  if (checked.response) return checked.response;
  const data = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!data || typeof data.op !== "string")
    return NextResponse.json({ error: "Browser action required" }, { status: 400, headers: HEADERS });
  const allowed = ["start","takeover","release","heartbeat","navigate","new_tab","switch_tab","close_tab","viewport","click","wheel","type","key"];
  if (!allowed.includes(data.op)) return NextResponse.json({ error: "Unsupported browser action" },
    { status: 400, headers: HEADERS });
  if (data.op === "navigate" && (typeof data.url !== "string" || data.url.length > 2048))
    return NextResponse.json({ error: "Invalid website URL" }, { status: 400, headers: HEADERS });
  if (data.op === "new_tab" && data.url !== undefined &&
      (typeof data.url !== "string" || data.url.length > 2048))
    return NextResponse.json({ error: "Invalid tab URL" }, { status: 400, headers: HEADERS });
  if (["switch_tab","close_tab"].includes(data.op) &&
      (typeof data.tabIndex !== "number" || !Number.isSafeInteger(data.tabIndex) || data.tabIndex < 0 || data.tabIndex > 7))
    return NextResponse.json({ error: "Invalid tab" }, { status: 400, headers: HEADERS });
  try {
    const session = data.op === "start" ?
      await openProjectBrowser(params.projectId, checked.owner!, undefined, true) :
      await findProjectBrowser(params.projectId, checked.owner!);
    if (!session) return NextResponse.json({ error: "Open a browser session first" },
      { status: 409, headers: HEADERS });
    if (data.op !== "start")
      await projectBrowserOperation(session, {
        op: data.op, url: typeof data.url === "string" ? data.url : undefined,
        tabIndex: typeof data.tabIndex === "number" ? data.tabIndex : undefined,
        width: typeof data.width === "number" ? data.width : undefined,
        height: typeof data.height === "number" ? data.height : undefined,
        x: typeof data.x === "number" ? data.x : undefined,
        y: typeof data.y === "number" ? data.y : undefined,
        deltaY: typeof data.deltaY === "number" ? data.deltaY : undefined,
        text: typeof data.text === "string" ? data.text : undefined,
        key: typeof data.key === "string" ? data.key : undefined,
      });
    return NextResponse.json(await projectBrowserStatus(session, params.projectId), { headers: HEADERS });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 180) :
      "Browser operation failed" }, { status: 409, headers: HEADERS });
  }
}
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-origin close denied" },
    { status: 403, headers: HEADERS });
  const checked = await authorize(req, params.projectId);
  if (checked.response) return checked.response;
  await stopProjectBrowser(params.projectId, checked.owner!);
  return NextResponse.json({ connected: false }, { headers: HEADERS });
}
