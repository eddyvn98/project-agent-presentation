"use client";
import { useEffect, useState } from "react";
import type { AgentProactiveSuggestion } from "@/lib/project-agent/proactive-suggestions";

export function AgentProactiveSuggestions({ projectId }: { projectId?: string }) {
  const [items, setItems] = useState<AgentProactiveSuggestion[]>([]);
  const [error, setError] = useState("");
  const refresh = async () => {
    const response = await fetch("/api/project-agent/proactive", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { suggestions: AgentProactiveSuggestion[] };
    setItems(data.suggestions.filter(item => !projectId || item.projectId === projectId).slice(0, 4));
  };
  useEffect(() => {
    void refresh().catch(() => {});
    const interval = setInterval(() => { if (document.visibilityState === "visible") void refresh().catch(() => {}); }, 60000);
    return () => clearInterval(interval);
  }, [projectId]);
  async function decide(id: string, action: "dismiss" | "snooze") {
    setError("");
    try {
      const response = await fetch("/api/project-agent/proactive", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!response.ok) throw new Error("Could not update suggestion");
      setItems(previous => previous.filter(x => x.id !== id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save"); }
  }
  if (!items.length && !error) return null;
  return <section className="mx-auto w-full max-w-3xl space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
    aria-label="Proactive Agent suggestions">
    <h2 className="text-sm font-semibold">Suggested automations</h2>
    <p className="text-xs text-slate-500">Based on repeated work. Proposals never run until you approve.</p>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    {items.map(item => <article className="rounded-lg border p-2 text-sm" key={item.id}>
      <p className="font-medium">{item.reason}</p>
      <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{item.prompt}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <a className="rounded-md bg-orange-600 px-3 py-1.5 text-xs text-white"
          href={"/account/scheduled-tasks?suggestionId=" + encodeURIComponent(item.id)}>
          Review schedule</a>
        <button type="button" className="rounded-md border px-2 py-1.5 text-xs"
          onClick={() => void decide(item.id, "snooze")}>Remind later</button>
        <button type="button" className="rounded-md border px-2 py-1.5 text-xs"
          onClick={() => void decide(item.id, "dismiss")}>Dismiss</button>
      </div>
    </article>)}
  </section>;
}
