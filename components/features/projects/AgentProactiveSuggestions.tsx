"use client";
import { useEffect, useState } from "react";
import type { AgentProactiveSuggestion } from "@/lib/project-agent/proactive-suggestions";

export function AgentProactiveSuggestions() {
  const [items, setItems] = useState<AgentProactiveSuggestion[]>([]);
  useEffect(() => {
    let alive = true;
    void fetch("/api/project-agent/proactive", { cache: "no-store" }).then(r => r.ok ? r.json() : null)
      .then((data: { suggestions?: AgentProactiveSuggestion[] } | null) => {
        if (alive) setItems(data?.suggestions ?? []);
      }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!items.length) return null;
  return <section className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">Suggested automations</h2>
    <p className="text-sm text-slate-500">These suggestions are based on repeated completed work. No schedule is created without your action.</p>
    {items.map(s => <article key={s.id} className="space-y-1 rounded-lg border p-3">
      <p className="text-sm font-medium">{s.reason}</p>
      <p className="line-clamp-3 text-sm text-slate-600 dark:text-slate-300">{s.prompt}</p>
      <a className="inline-block rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white"
        href={"/account/scheduled-tasks?projectId=" + encodeURIComponent(s.projectId) +
          "&prompt=" + encodeURIComponent(s.prompt)}>Review scheduling</a>
    </article>)}
  </section>;
}
