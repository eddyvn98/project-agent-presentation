import { NextRequest, NextResponse } from "next/server";
import type { CreateProjectAgentTaskInput } from "@/lib/project-agent/types";
import { createProjectAgentTask, listProjectAgentTaskPage, readProjectAgentTask } from "@/lib/project-agent/task-store";
import { toPublicProjectAgentTask, toPublicProjectAgentTaskWithFileMetadata } from "@/lib/project-agent/public-task";
import { decodeProjectAgentTaskCursor, type ProjectAgentTaskCursor } from "@/lib/project-agent/task-pagination";
import { isProjectAgentDifyConfigured } from "@/lib/project-agent/dify-agent";
import { startProjectAgentTask } from "@/lib/project-agent/task-runner";
import { recoverProjectAgentTask } from "@/lib/project-agent/task-recovery";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { listProjectConversationMembers } from "@/lib/capabilities/project-sharing";
import * as projectCap from "@/lib/capabilities/project";
import { allowedEngines } from "@/lib/project-agent/runtime/engines";
import { allowedModulesForRequest } from "@/app/api/aidt-access/_module-guard";
import { parseProjectAgentRequestedFiles } from "@/lib/project-agent/task-inputs";
import { newGoal, saveGoal } from "@/lib/project-agent/goal-store";
import { goalTurnPrompt } from "@/lib/project-agent/goal-prompts";

export const runtime = "nodejs";
export const maxDuration = 600;
const PROJECT_AGENT_USER_PROMPT_MAX_CHARS = 12_000;

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
  if (auth.response) return auth.response;

  const requested = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 20) : 10;
  let cursor: ProjectAgentTaskCursor | null;
  try {
    cursor = decodeProjectAgentTaskCursor(req.nextUrl.searchParams.get("cursor"));
  } catch {
    return NextResponse.json({ error: "Invalid history cursor" }, { status: 400 });
  }
  const members = await listProjectConversationMembers(params.projectId, auth.callerEmail!);
  if (!members) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const page = await listProjectAgentTaskPage(members, params.projectId, limit, cursor ?? undefined, req.nextUrl.searchParams.get("q") ?? undefined);
  const recovered = await Promise.all(page.tasks.map(recoverProjectAgentTask));
  return NextResponse.json({
    tasks: await Promise.all(recovered.map((task) => toPublicProjectAgentTaskWithFileMetadata(task, auth.callerEmail!))),
    nextCursor: page.nextCursor ?? null,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
  if (auth.response) return auth.response;
  if (!isProjectAgentDifyConfigured()) {
    return NextResponse.json({ error: "Dify Project Agent is not configured" }, { status: 503 });
  }

  let prompt = "";
  let userPrompt: string | undefined;
  let conversationId: string | undefined;
  const body = await req.json().catch(() => ({})) as {
    prompt?: unknown; userPrompt?: unknown; conversationId?: unknown; modelSelector?: unknown; inputFiles?: CreateProjectAgentTaskInput["inputFiles"]; retryOfTaskId?: unknown; goal?: { objective?: unknown; condition?: unknown };
  };
  prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  userPrompt = typeof body.userPrompt === "string" ? body.userPrompt.trim() : undefined;
  if (userPrompt && userPrompt.length > PROJECT_AGENT_USER_PROMPT_MAX_CHARS) {
    return NextResponse.json({ error: "User message is too long" }, { status: 413 });
  }
  conversationId = typeof body.conversationId === "string" ? body.conversationId : undefined;
  const parsedFiles = parseProjectAgentRequestedFiles(body.inputFiles);
  if ("error" in parsedFiles) return NextResponse.json({ error: parsedFiles.error }, { status: parsedFiles.status });
  let inputFiles: CreateProjectAgentTaskInput["inputFiles"] = parsedFiles.files;
  let reuseInputsFrom: string | undefined;
  if (typeof body.retryOfTaskId === "string" && !inputFiles.length) {
    const previous = await readProjectAgentTask(body.retryOfTaskId).catch(() => null);
    if (previous?.projectId === params.projectId && previous.ownerEmail === auth.callerEmail && previous.inputFiles?.length) {
      inputFiles = previous.inputFiles.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size }));
      reuseInputsFrom = previous.id;
    }
  }
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

  if (inputFiles.some((file) => file.projectSourceId)) {
    const project = await projectCap.getProject(params.projectId, auth.ownerEmail!);
    const sources = project.ok && project.data ? project.data.knowledgeFiles : [];
    if (inputFiles.some((file) => file.projectSourceId && !sources.some((source) => source.id === file.projectSourceId && source.sizeBytes === file.size))) {
      return NextResponse.json({ error: "An attached Project source was not found" }, { status: 400 });
    }
  }

  const goalObjective = typeof body.goal?.objective === "string" ? body.goal.objective.trim() : "";
  const goal = goalObjective ? newGoal({ projectId: params.projectId, ownerEmail: auth.callerEmail!, objective: goalObjective, condition: typeof body.goal?.condition === "string" ? body.goal.condition : undefined }) : null;
  if (goal) prompt = goalTurnPrompt(goal, 1, prompt === goalObjective ? undefined : prompt);
  const task = await createProjectAgentTask({
    projectId: params.projectId,
    ownerEmail: auth.callerEmail!,
    projectOwnerEmail: auth.ownerEmail!,
    ...(userPrompt ? { userPrompt } : {}),
    prompt,
    conversationId,
    ...(typeof body.modelSelector === "string" ? { modelSelector: body.modelSelector } : {}),
    engines: await allowedEngines(async (moduleId) => (await allowedModulesForRequest(req, [moduleId])).allowed ?? null),
    ...(inputFiles.length ? { inputFiles } : {}),
    ...(reuseInputsFrom ? { reuseInputsFrom } : {}),
  });

  if (goal) await saveGoal(conversationId ?? task.id, goal);
  startProjectAgentTask(task.id);
  return NextResponse.json({ task: toPublicProjectAgentTask(task) }, { status: 202 });
}
