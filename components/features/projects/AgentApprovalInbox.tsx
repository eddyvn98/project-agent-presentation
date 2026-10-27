"use client";
import { useCallback, useEffect, useState } from "react";
import type { AgentApproval } from "@/lib/project-agent/agent-approvals";

export function AgentApprovalInbox() {
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const refresh = useCallback(async () => {
    const res = await fetch("/api/project-agent/approvals", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load Agent approvals");
    setApprovals(((await res.json()) as { approvals: AgentApproval[] }).approvals);
  }, []);
  useEffect(() => {
    void refresh().catch(e => setError(String(e)));
    const interval = setInterval(() => void refresh().catch(() => {}), 8000);
    return () => clearInterval(interval);
  }, [refresh]);
  async function decide(id: string, approve: boolean) {
    setBusy(id); setError("");
    try {
      const res = await fetch("/api/project-agent/approvals", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, approve }),
      });
      if (!res.ok) throw new Error("Approval expired or could not be saved");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Approval unavailable"); }
    finally { setBusy(""); }
  }
  const pending = approvals.filter(x => x.state === "pending" && Date.parse(x.expiresAt) > Date.now());
  return <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/50" aria-label="Agent approval inbox">
    <h2 className="font-semibold">Approval inbox ({pending.length})</h2>
    <p className="text-sm text-slate-500">One-time consent for sensitive browser actions. Every request is bound to your account, project, site and exact action. Approval expires automatically.</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {!pending.length && <p className="text-sm text-slate-500">No actions waiting for your decision.</p>}
    {pending.map(item => <article key={item.id} className="space-y-2 rounded-lg border border-orange-200 p-3">
      <div className="flex items-center justify-between gap-2"><strong className="text-sm">{item.host}</strong>
        <span className="text-xs text-slate-400">Expires {new Date(item.expiresAt).toLocaleTimeString()}</span></div>
      <p className="break-words text-sm">{item.intent}</p>
      <p className="text-xs text-slate-500">Project {item.projectId} · Task {item.taskId}</p>
      <div className="flex gap-2">
        <button type="button" disabled={busy === item.id} onClick={() => void decide(item.id, true)}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white">Approve once</button>
        <button type="button" disabled={busy === item.id} onClick={() => void decide(item.id, false)}
          className="rounded-lg border px-3 py-1.5 text-xs">Deny</button>
      </div>
    </article>)}
  </section>;
}
