"use client";
import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";

interface Notice { id: string; title: string; projectId: string; occurrence: string;
  status: "done" | "failed"; summary?: string; taskId?: string; changed?: boolean; completedAt?: string }
export function ProjectAgentScheduleNotifications() {
  const [items, setItems] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const r = await fetch("/api/project-agent/schedules/notifications", { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json() as { notifications: Notice[] };
        if (alive) setItems(data.notifications);
      } catch { /* Network errors should not block the conversation. */ }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  async function acknowledge(n: Notice) {
    setBusy(true);
    try {
      const response = await fetch("/api/project-agent/schedules/notifications", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id, occurrence: n.occurrence }),
      });
      if (!response.ok) throw new Error("Failed to mark notification as read");
      setItems(current => current.filter(item =>
        item.id !== n.id || item.occurrence !== n.occurrence));
    } finally { setBusy(false); }
  }
  return <div className="relative">
    <button type="button" title="Scheduled Agent notifications" aria-label={"Scheduled Agent notifications: " + items.length}
      aria-expanded={open} onClick={() => setOpen(value => !value)}
      className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
      <Bell className="h-4 w-4" />{items.length > 0 &&
        <span className="absolute -right-1 -top-1 rounded-full bg-orange-600 px-1 text-[10px] text-white">{Math.min(items.length, 30)}</span>}
    </button>
    {open && <section aria-label="Scheduled task results"
      className="absolute right-0 top-10 z-30 max-h-80 w-[min(84vw,330px)] overflow-y-auto rounded-xl border bg-white p-3 shadow-xl dark:bg-slate-900">
      <div className="mb-2 flex items-center justify-between gap-2">
        <strong className="text-sm">Scheduled task results</strong>
        <a href="/account/scheduled-tasks" className="text-xs text-orange-600 underline">All schedules</a>
      </div>
      {!items.length && <p className="text-xs text-slate-500">No unread results.</p>}
      {items.map(n => <div key={n.id + n.occurrence} className="border-t py-2 text-xs">
        <p className="font-semibold">{n.title} · {n.status === "done" ? "Done" : "Failed"}</p>
        {n.summary && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-slate-500">{n.summary}</p>}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-slate-400">{new Date(n.completedAt ?? n.occurrence).toLocaleString()}</span>
          <button type="button" disabled={busy} onClick={() => void acknowledge(n).catch(() => {})}
            className="inline-flex items-center gap-1 rounded border px-2 py-1"><Check className="h-3 w-3" />Read</button>
        </div>
      </div>)}
    </section>}
  </div>;
}
