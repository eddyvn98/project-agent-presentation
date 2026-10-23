import { requireModuleAccess } from "@/app/api/aidt-access/_module-guard";
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import * as cap from "@/lib/capabilities/project";
import { deleteProjectIndex } from "@/lib/vector-store";
import { deleteProjectHindsightBank } from "@/lib/project-agent/hindsight/memory";

export const runtime = "nodejs";

async function getEmail(req: NextRequest): Promise<string | null> {
  const token = await getToken({ req });
  let email = token?.email;
  if (!email && process.env.NODE_ENV !== "production") {
    email = "user@company.com";
  }
  return email ?? null;
}

export async function GET(req: NextRequest) {
  const denied = await requireModuleAccess(req, "assistant");
  if (denied) return denied;
  const email = await getEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [owned, shared] = await Promise.all([
      cap.listProjects(email),
      cap.listProjectsSharedWith(email),
    ]);
    return NextResponse.json([...(owned.data ?? []), ...shared].filter((project) => !cap.isHiddenProject(project)));
  } catch (error) {
    console.error("[projects] failed to read project storage", error);
    return NextResponse.json({ error: "Project storage is unavailable; existing data was not changed" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireModuleAccess(req, "assistant");
  if (denied) return denied;
  const email = await getEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const result = await cap.createProject(email, {
    name: body.name.trim(),
    description: body.description ?? "",
    instructions: body.instructions ?? "",
    memoryMode: body.memoryMode === "DEFAULT" ? "DEFAULT" : "PROJECT_ONLY",
    icon: body.icon ?? "📁",
    color: body.color ?? "#6366f1",
  });
  return NextResponse.json(result.data, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const denied = await requireModuleAccess(req, "assistant");
  if (denied) return denied;
  const email = await getEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const access = await cap.getProjectAccess(id, email);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ error: "Edit access is required" }, { status: 403 });

  delete patch.hasShared;
  delete patch.origin;
  delete patch.boardId;
  if (Object.hasOwn(patch, "memoryMode")) {
    if (patch.memoryMode !== "DEFAULT" && patch.memoryMode !== "PROJECT_ONLY") {
      return NextResponse.json({ error: "Memory mode must be DEFAULT or PROJECT_ONLY" }, { status: 400 });
    }
    if (access.role !== "OWNER") return NextResponse.json({ error: "Only the owner can change memory mode" }, { status: 403 });
    if (patch.memoryMode === "DEFAULT" && (access.project.hasShared || await cap.projectHasSharing(id))) {
      await cap.markProjectShared(id, access.ownerEmail);
      return NextResponse.json({ error: "Shared projects must use project-only memory" }, { status: 409 });
    }
  }

  const result = await cap.updateProject(id, access.ownerEmail, patch);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.code === "PROJECT_SHARED" ? 409 : 404 });
  return NextResponse.json(access.role === "OWNER" ? result.data : { ...result.data, sharedRole: access.role });
}

export async function DELETE(req: NextRequest) {
  const denied = await requireModuleAccess(req, "assistant");
  if (denied) return denied;
  const email = await getEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await cap.getProject(id, email);
  if (!existing.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try { await deleteProjectHindsightBank(id); }
  catch { return NextResponse.json({ error: "Could not erase long-term Project memory; Project was not deleted" }, { status: 503 }); }
  await cap.deleteProject(id, email);
  await cap.deleteProjectShares(id, email);
  deleteProjectIndex(id).catch(() => {});
  return NextResponse.json({ success: true });
}
