import { createHash } from "node:crypto";
import { readProactiveSignals } from "./proactive-signals";
import { listSchedules } from "./scheduled-mongo-store";
import type { ProjectAgentTask } from "./types";

export interface AgentProactiveSuggestion {
  id: string; title: string; prompt: string; projectId: string;
  occurrences: number; lastSeenAt: string; reason: string;
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const norm = (s: string) => s.toLowerCase().replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
const sensitive = /(password|otp|secret|token|credit.card|bank|financial.transfer|mật khẩu|mã otp|chuyển khoản|thanh toán)/iu;
/** Deterministic, owner-scoped suggestions only. Never schedules or executes on its own. */
export async function proactiveSuggestions(owner: string, knownHistory?: ProjectAgentTask[]): Promise<AgentProactiveSuggestion[]> {
  const [history, schedules] = await Promise.all([knownHistory ? Promise.resolve(knownHistory) : readProactiveSignals(owner), listSchedules(owner)]);
  const groups = new Map<string, Array<{ projectId: string; prompt: string; createdAt: string }>>();
  const since = Date.now() - 45 * 86_400_000;
  for (const task of history) {
    if (task.ownerEmail.toLowerCase().trim() !== owner.toLowerCase().trim() ||
      task.status !== "done" || Date.parse(task.createdAt) < since || task.scheduleRunId) continue;
    const original = (task.userPrompt ?? task.prompt).trim();
    if (original.length < 16 || original.length > 1000 || sensitive.test(original)) continue;
    const key = norm(original);
    if (key.length < 15) continue;
    groups.set(key, [...(groups.get(key) ?? []), {
      projectId: task.projectId, prompt: original, createdAt: task.createdAt,
    }].slice(-15));
  }
  const results: AgentProactiveSuggestion[] = [];
  for (const [key, tasks] of groups) {
    if (tasks.length < 3 || schedules.some(item => norm(item.prompt) === key)) continue;
    const recent = tasks.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0];
    results.push({ id: hash(key), title: "Automate repeated work", prompt: recent.prompt,
      projectId: recent.projectId, occurrences: tasks.length, lastSeenAt: recent.createdAt,
      reason: "You completed a similar request " + tasks.length + " times recently." });
  }
  return results.sort((a,b) => b.occurrences - a.occurrences).slice(0, 8);
}
