"use client";
import { useEffect, useState } from "react";
import type { AgentObservability } from "@/lib/project-agent/agent-observability";

export function AgentObservabilityDashboard() {
  const [data, setData] = useState<AgentObservability | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch("/api/project-agent/observability", { cache: "no-store" });
      if (!res.ok) throw new Error("Agent telemetry unavailable");
      const payload = await res.json() as { stats: AgentObservability };
      if (alive) setData(payload.stats);
    };
    void load().catch(e => setError(String(e)));
    const timer = setInterval(() => void load().catch(() => {}), 30_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  const max = Math.max(1, ...(data?.days.map(x => x.completed + x.failed) ?? [1]));
  const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: "compact" }).format(n);
  return <section className="mx-auto max-w-5xl space-y-5 p-4" aria-label="Agent observability dashboard">
    <header><h1 className="text-xl font-semibold">Agent Observability</h1>
      <p className="text-sm text-slate-500">Your account's execution, progress stalls, human-review needs and scheduled activity over the last 30 days.</p></header>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {data && <>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Completed", data.completed.toLocaleString()], ["Failed", data.failed.toLocaleString()],
          ["Success rate", data.successRate + "%"], ["Prompt tokens", compact(data.tokens)], ["Output tokens", compact(data.outputTokens)],
          ["Est. model cost", data.estimatedCostUsd === null ? "Not configured" : "$" + data.estimatedCostUsd.toFixed(4)],
          ["Avg. duration", data.avgDurationSeconds + " s"], ["Active schedules", String(data.activeSchedules)],
          ["Approvals pending", String(data.pendingApprovals)],
          ["Loop stops", String(data.loopStopped ?? 0)], ["Requires review", String(data.needsReview ?? 0)],
          ["Tool failures", String(data.toolFailures ?? 0)],
          ["P8 browser actions", String(data.p8Actions ?? 0)],
          ["Observed browser progress", String(data.p8Verified ?? 0)],
          ["Unverified browser steps", String(data.p8Unverified ?? 0)],
          ["Human browser interventions", String(data.p8Interventions ?? 0)],
          ["Blocked browser attempts", String(data.p8Blocked ?? 0)],
        ].map(([label, value]) => <div key={label} className="rounded-xl border p-3">
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
        </div>)}
      </div>
      <div className="rounded-xl border p-4">
        <h2 className="font-semibold">Daily task results</h2>
        <div className="mt-3 flex h-36 items-end gap-1" role="img"
          aria-label="Daily completed and failed tasks over the last 30 days">
          {data.days.map(day => <div key={day.date} className="group flex min-w-0 flex-1 flex-col-reverse gap-0.5"
            title={day.date + ": " + day.completed + " completed, " + day.failed + " failed"}>
            <div className="w-full rounded-t-sm bg-slate-500" style={{ height: Math.max(1, day.completed / max * 125) }} />
            {day.failed > 0 && <div className="w-full bg-orange-500" style={{ height: Math.max(3, day.failed / max * 125) }}/>}
          </div>)}
        </div>
        <p className="mt-2 text-xs text-slate-500">Dark: completed · Orange: failed. Technical loop stops and review counts reflect recorded task data. P8 progress is observable DOM evidence, not proof that the overall goal was achieved. Token counts are not a spending limit.</p>
      </div>
      <div className="overflow-auto rounded-xl border p-3"><h2 className="mb-3 font-semibold">Recent task runs</h2>
        <table className="w-full text-left text-xs">
          <thead><tr className="border-b"><th className="py-2">When</th><th>Status</th><th>Duration</th><th>Tokens</th><th>Task</th></tr></thead>
          <tbody>{data.recent.map(task => <tr className="border-b last:border-0" key={task.id}>
            <td className="py-2 whitespace-nowrap">{new Date(task.createdAt).toLocaleString()}</td>
            <td>{task.status}</td><td>{task.durationSeconds} s</td>
            <td>{compact(task.tokens)}</td><td className="font-mono text-[10px]" title={task.error}>{task.id}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>;
}
