import { readInsightHistory } from "./insights-store";
import { taskIssue } from "./task-issue";
import { listSchedules } from "./scheduled-store";
import { listAgentApprovals } from "./agent-approvals";

export interface AgentMetricDay {
  date: string; completed: number; failed: number; tokens: number; durationSeconds: number;
}
export interface AgentObservability {
  total: number; completed: number; failed: number; successRate: number;
  tokens: number; outputTokens: number; estimatedCostUsd: number | null;
  durationSeconds: number; avgDurationSeconds: number;
  pendingApprovals: number; activeSchedules: number;
  loopStopped: number; needsReview: number; toolFailures: number;
  days: AgentMetricDay[]; recent: Array<{ id: string; status: string; createdAt: string;
    durationSeconds: number; tokens: number; error?: string }>;
}
function tokenCount(log: string[]) {
  const line = log.findLast(s => s.includes("metrics ::")) ?? "";
  return Number(line.match(/prompt_tokens=(\d+)/)?.[1] ?? 0);
}
function duration(task: { createdAt: string; updatedAt: string }) {
  return Math.max(0, Math.round((Date.parse(task.updatedAt) - Date.parse(task.createdAt)) / 1000));
}
/** Never return prompts or other owners' task records. */
export async function accountAgentObservability(owner: string): Promise<AgentObservability> {
  const [history, schedules, approvals] = await Promise.all([
    readInsightHistory(), listSchedules(owner), listAgentApprovals(owner),
  ]);
  const cutoff = Date.now() - 30 * 86_400_000;
  const tasks = history.filter(task => task.ownerEmail.trim().toLowerCase() === owner.trim().toLowerCase() &&
    Date.parse(task.createdAt) >= cutoff).slice(-500);
  const dates = new Map<string, AgentMetricDay>();
  const days = 30;
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
    dates.set(date, { date, completed: 0, failed: 0, tokens: 0, durationSeconds: 0 });
  }
  let completed = 0, failed = 0, tokens = 0, outputTokens = 0, durationSeconds = 0;
  let estimatedCostUsd = 0, priced = 0;
  let loopStopped = 0, needsReview = 0, toolFailures = 0;
  for (const task of tasks) {
    const used = tokenCount(task.log ?? []), seconds = duration(task);
    const issue = taskIssue(task.error ?? "");
    if (issue?.kind === "loop" || task.log.some(line => /stall_stop|loop_blocked/.test(line))) loopStopped++;
    if (issue?.needsReview) needsReview++;
    toolFailures += Number((task.log.findLast(line => line.includes("metrics ::")) ?? "").match(/failed=(\d+)/)?.[1] ?? 0);
    tokens += used; durationSeconds += seconds;
    const metric = task.log.findLast(s => s.includes("metrics ::")) ?? "";
    outputTokens += Number(metric.match(/out_total=(\d+)/)?.[1] ?? 0);
    const price = Number(metric.match(/cost_usd=(\d+(?:\.\d+)?)/)?.[1]);
    if (metric.includes("cost_usd=") && Number.isFinite(price)) {
      estimatedCostUsd += price; priced++;
    }
    if (task.status === "done") completed++; else if (task.status === "failed") failed++;
    const day = dates.get(task.createdAt.slice(0, 10));
    if (day) {
      if (task.status === "done") day.completed++;
      if (task.status === "failed") day.failed++;
      day.tokens += used; day.durationSeconds += seconds;
    }
  }
  const finished = completed + failed;
  return { total: tasks.length, completed, failed,
    successRate: finished ? Math.round(completed / finished * 1000) / 10 : 0,
    tokens, outputTokens, estimatedCostUsd: priced === tasks.length && tasks.length ?
      Math.round(estimatedCostUsd * 1_000_000) / 1_000_000 : null,
    durationSeconds, avgDurationSeconds: finished ? Math.round(durationSeconds / finished) : 0,
    loopStopped, needsReview, toolFailures,
    pendingApprovals: approvals.filter(a => a.state === "pending" && Date.parse(a.expiresAt) > Date.now()).length,
    activeSchedules: schedules.filter(s => s.status === "active").length,
    days: [...dates.values()],
    recent: tasks.slice(-30).reverse().map(task => ({
      id: task.id, status: task.status, createdAt: task.createdAt,
      durationSeconds: duration(task), tokens: tokenCount(task.log ?? []),
      ...(task.status === "failed" ? { error: (task.error ?? "Task failed").slice(0, 140) } : {}),
    })) };
}
