"use client";
import { useEffect, useState } from "react";
import { Bell, Check, ExternalLink } from "lucide-react";

interface Notice {
  id: string; category: "schedule" | "workflow" | "approval";
  ownerId: string; occurrence: string; title: string; message: string;
  status: string; createdAt: string; href: string;
}
export function ProjectAgentScheduleNotifications() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/project-agent/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json() as { notifications: Notice[] };
        if (alive) setNotices(data.notifications);
      } catch { /* Non-blocking notification channel. */ }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 15_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  async function acknowledge(n: Notice) {
    setBusy(n.id); setError("");
    try {
      const res = await fetch("/api/project-agent/notifications", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.ownerId, category: n.category, occurrence: n.occurrence }),
      });
      if (!res.ok) throw new Error("Cannot acknowledge Agent notification");
      setNotices(old => old.filter(x => x.id !== n.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Notification unavailable"); }
    finally { setBusy(""); }
  }
  return <div className="relative">
    <button type="button" title="Agent notifications"
      aria-label={"Agent notifications: " + notices.length} aria-expanded={open}
      onClick={() => setOpen(current => !current)}
      className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
      <Bell className="h-4 w-4" />
      {notices.length > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-orange-600 px-1 text-[10px] text-white">
        {Math.min(notices.length, 50)}
      </span>}
    </button>
    {open && <section aria-label="Agent notification center"
      className="absolute right-0 top-10 z-30 max-h-96 w-[min(88vw,370px)] overflow-y-auto rounded-xl border bg-white p-3 shadow-xl dark:bg-slate-900">
      <div className="mb-2 flex items-center justify-between gap-2">
        <strong className="text-sm">Agent notifications</strong>
        <a href="/account/agent-control" className="text-xs text-orange-600 underline">Control Center</a>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {!notices.length && <p className="text-xs text-slate-500">No notifications.</p>}
      {notices.map(n => <article className="space-y-1 border-t py-2 text-xs" key={n.id}>
        <p className="font-semibold">{n.title} · {n.status.replace("_"," ")}</p>
        <p className="line-clamp-3 break-words whitespace-pre-wrap text-slate-500">{n.message}</p>
        <p className="text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
        <div className="flex justify-end gap-2">
          <a href={n.href} className="inline-flex items-center gap-1 rounded border px-2 py-1">
            <ExternalLink className="h-3 w-3" />{n.category === "approval" || n.status === "waiting_approval" ? "Review" : "Open"}
          </a>
          {n.category !== "approval" && n.status !== "waiting_approval" &&
            <button type="button" disabled={busy === n.id} onClick={() => void acknowledge(n)}
              className="inline-flex items-center gap-1 rounded border px-2 py-1">
              <Check className="h-3 w-3" />Read</button>}
        </div>
      </article>)}
    </section>}
  </div>;
}
