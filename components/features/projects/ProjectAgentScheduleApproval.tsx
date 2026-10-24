"use client";

import { useEffect, useState } from "react";
import type { ScheduledAgentTask } from "@/lib/project-agent/scheduled-types";

export function ProjectAgentScheduleApproval({ projectId }: { projectId: string }) {
  const [proposals, setProposals] = useState<ScheduledAgentTask[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const res = await fetch("/api/project-agent/schedules", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json() as { schedules: ScheduledAgentTask[] };
        if (alive) setProposals(data.schedules.filter(s => s.projectId === projectId &&
          (s.status === "pending" || Boolean(s.pendingAction))).slice(0, 4));
      } catch { /* Optional status widget must not interrupt chat. */ }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 7000);
    return () => { alive = false; clearInterval(interval); };
  }, [projectId]);
  async function decide(schedule: ScheduledAgentTask, action: "approve" | "delete" | "approve_action" | "reject_action") {
    setBusy(schedule.id); setError("");
    try {
      const res = await fetch("/api/project-agent/schedules", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: schedule.id, action }),
      });
      if (!res.ok) throw new Error("Could not update the proposal");
      setProposals(items => items.filter(item => item.id !== schedule.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save"); }
    finally { setBusy(null); }
  }
  if (!proposals.length && !error) return null;
  return <div className="mx-auto mb-2 w-full max-w-3xl space-y-2" aria-label="Agent schedule approvals">
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    {proposals.map(s => <section key={s.id} className="rounded-xl border border-orange-300 bg-orange-50/60 p-3 text-sm dark:bg-orange-950/20">
      <p className="font-medium">{s.pendingAction ? "Agent requests " + s.pendingAction + " for: " : "Agent suggests a scheduled task: "}{s.title}</p>
      <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">{s.prompt}</p>
      <p className="mt-1 text-xs text-slate-500">{s.spec.kind} · {s.spec.timezone} · First run {s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : "unavailable"}</p>
      <p className="mt-1 text-xs">{s.pendingAction ? "The proposed modification has not been applied." : "Not active until you approve."}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy === s.id} onClick={() => void decide(s, s.pendingAction ? "approve_action" : "approve")}
          className="rounded-md bg-orange-600 px-3 py-1.5 text-xs text-white">Approve schedule</button>
        <button type="button" disabled={busy === s.id} onClick={() => void decide(s, s.pendingAction ? "reject_action" : "delete")}
          className="rounded-md border px-3 py-1.5 text-xs">Dismiss</button>
        <a href="/account/scheduled-tasks" className="rounded-md px-2 py-1.5 text-xs underline">Review details</a>
      </div>
    </section>)}
  </div>;
}
