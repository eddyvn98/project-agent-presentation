import type { RuntimeInput } from "./runtime/run-agent-types";
import type { RuntimeAction } from "./runtime/actions";
import { createSchedule, listSchedules, updateSchedule } from "./scheduled-store";
import * as projectCap from "@/lib/capabilities/project";

type Action = Extract<RuntimeAction, { action: "schedule" }>;
export async function agentScheduleAction(input: RuntimeInput, action: Action) {
  if (!input.ownerEmail || !input.projectId) return { text: "Schedule tools need an authenticated user and Project", failed: true };
  const owner = input.ownerEmail;
  if (action.op === "list") {
    const schedules = await listSchedules(owner);
    return { text: JSON.stringify(schedules.map(({ id, title, prompt, projectId, spec, status, nextRunAt }) =>
      ({ id, title, prompt, projectId, spec, status, nextRunAt }))) };
  }
  if (input.scheduledRun && action.op !== "list") return { text: "Unattended runs cannot change schedules", failed: true };
  if (input.readOnly || input.depth) return { text: "Only the primary Agent can manage scheduled tasks", failed: true };
  try {
    if (action.op === "create" || action.op === "propose") {
      if (!await projectCap.getProjectAccess(input.projectId, owner))
        return { text: "User has no access to the target Project", failed: true };
      const spec = action.kind === "watch" ?
        { kind: "watch" as const, timezone: action.timezone!, everyMinutes: action.everyMinutes, url: action.url } :
        action.kind === "interval" ?
        { kind: "interval" as const, timezone: action.timezone!, everyMinutes: action.everyMinutes } : action.kind === "once" ?
        { kind: "once" as const, timezone: action.timezone!, runAt: action.runAt } :
        { kind: action.kind!, timezone: action.timezone!, localTime: action.localTime,
          ...(action.kind === "weekly" ? { weekdays: action.weekdays } : {}) };
      const schedule = await createSchedule(owner, { projectId: input.projectId, title: action.title!,
        prompt: action.prompt!, spec }, true);
      return { text: "Schedule awaiting user approval: " + JSON.stringify({
        id: schedule.id, title: schedule.title, nextRunAt: schedule.nextRunAt,
        timezone: schedule.spec.timezone, projectId: schedule.projectId,
      }) };
    }
    // Neither user text nor page content is a signed approval. Persist a proposal only.
    const requestedAction = ("suggest_" + action.op) as "suggest_pause" | "suggest_resume" | "suggest_delete";
    const schedule = await updateSchedule(owner, action.id!, { action: requestedAction });
    return { text: "Schedule change awaits owner approval: " + JSON.stringify({
      id: schedule?.id, proposedAction: schedule?.pendingAction,
    }) };
  } catch (error) {
    return { text: "Schedule error: " + (error instanceof Error ? error.message : "unknown"), failed: true };
  }
}
