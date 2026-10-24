"use client";
import { useEffect, useState } from "react";
import type { ScheduledAgentTask, ScheduleSpec } from "@/lib/project-agent/scheduled-types";
import { localScheduleInstant, formatLocalScheduleInstant } from "@/lib/project-agent/scheduled-time";
type Project = { id: string; name: string };
export function ScheduledAgentManager({ initialProjectId }: { initialProjectId?: string }) {
  const [items, setItems] = useState<ScheduledAgentTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [kind, setKind] = useState<ScheduleSpec["kind"]>("daily");
  const [localTime, setLocalTime] = useState("08:00");
  const [runAt, setRunAt] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [everyMinutes, setEveryMinutes] = useState(60);
  const [watchUrl, setWatchUrl] = useState("");
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const load = async () => {
    const response = await fetch("/api/project-agent/schedules", { cache: "no-store" });
    if (!response.ok) throw new Error("Cannot read schedules");
    setItems(((await response.json()) as { schedules: ScheduledAgentTask[] }).schedules);
  };
  useEffect(() => {
    void load().catch(e => setError(String(e)));
    const refresh = setInterval(() => { if (document.visibilityState === "visible") void load().catch(() => {}); }, 15000);
    void fetch("/api/projects").then(r => r.ok ? r.json() : []).then((data: Project[]) => {
      if (!Array.isArray(data)) return;
      setProjects(data); setProjectId(old => old || data[0]?.id || "");
    }).catch(() => {});
    return () => clearInterval(refresh);
  }, []);
  async function send(method: "POST" | "PATCH", body: object) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/project-agent/schedules", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Cannot update scheduled task");
      await load();
      if (method === "POST") { setTitle(""); setPrompt(""); }
      setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  function submit() {
    if (!projectId || !title.trim() || !prompt.trim()) return;
    let onceAt: string | undefined;
    try { if (kind === "once") onceAt = localScheduleInstant(runAt, timezone); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid scheduled time"); return; }
    const spec: ScheduleSpec = kind === "watch" ? { kind, timezone, everyMinutes, url: watchUrl } : kind === "interval" ? { kind, timezone, everyMinutes } : kind === "once"
      ? { kind, timezone, runAt: onceAt }
      : { kind, timezone, localTime, ...(kind === "weekly" ? { weekdays } : {}) };
    void send(editing ? "PATCH" : "POST", editing ? { id: editing, action: "edit", projectId, title, prompt, spec } : { projectId, title, prompt, spec });
  }
  const input = "w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900";
  return <section aria-label="Scheduled Agent Tasks" className="mx-auto max-w-4xl space-y-5 p-4">
    <header><h1 className="text-xl font-semibold">Scheduled Agent Tasks</h1>
      <p className="text-sm text-slate-500">Account-wide schedules, independent of your open browser. Runs appear in the selected Project chat.</p></header>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">{editing ? "Edit scheduled task" : "New scheduled task"}</h2>
      <label className="block text-sm">Title<input className={input} value={title} onChange={e => setTitle(e.target.value)} maxLength={140}/></label>
      <label className="block text-sm">Agent instructions<textarea rows={3} className={input} value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={6000}/></label>
      <label className="block text-sm">Save results to Project<select className={input} value={projectId} onChange={e => setProjectId(e.target.value)}>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">Frequency<select className={input} value={kind} onChange={e => setKind(e.target.value as ScheduleSpec["kind"])}>
          <option value="once">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="interval">Run at interval</option><option value="watch">When website changes</option>
        </select></label>
        <label className="text-sm">Timezone<input className={input} value={timezone} onChange={e => setTimezone(e.target.value)}/></label>
      </div>
      {kind === "watch" && <label className="block text-sm">Public HTTPS website URL<input type="url" className={input} value={watchUrl} onChange={e => setWatchUrl(e.target.value)} placeholder="https://example.com/updates"/></label>}
      {kind === "interval" || kind === "watch" ? <label className="block text-sm">Interval in minutes (15–1440)<input type="number" min={15} max={1440} step={15} className={input} value={everyMinutes} onChange={e => setEveryMinutes(Number(e.target.value))}/></label> : kind === "once"
        ? <label className="block text-sm">Date and time<input type="datetime-local" className={input} value={runAt} onChange={e => setRunAt(e.target.value)}/></label>
        : <label className="block text-sm">Local time<input type="time" className={input} value={localTime} onChange={e => setLocalTime(e.target.value)}/></label>}
      {kind === "weekly" && <div className="flex flex-wrap gap-2">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day,i) =>
        <label className="flex items-center gap-1 text-xs" key={day}><input type="checkbox" checked={weekdays.includes(i)}
          onChange={e => setWeekdays(old => e.target.checked ? [...old,i] : old.filter(n => n !== i))}/>{day}</label>)}</div>}
      <button type="button" disabled={busy || !title || !prompt || !projectId || (kind === "once" && !runAt) || (kind === "watch" && !watchUrl)}
        onClick={submit} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">{editing ? "Save changes" : "Create schedule"}</button>
      {editing && <button type="button" className="ml-2 rounded border px-3 py-2 text-sm" onClick={() => setEditing(null)}>Cancel edit</button>}
    </div>
    <div className="space-y-3"><h2 className="font-semibold">Your schedules ({items.length})</h2>
      {items.map(item => <article key={item.id} className="space-y-2 rounded-xl border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>{item.title}</strong>
          <span className="text-xs text-slate-500">{item.status}</span></div>
        <p className="whitespace-pre-wrap text-sm">{item.prompt}</p>
        <p className="text-xs text-slate-500">{item.spec.kind} · {item.spec.timezone} · Next: {item.nextRunAt ? new Date(item.nextRunAt).toLocaleString() : "none"}</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <button disabled={busy} className="rounded border px-2 py-1" onClick={() => void send("PATCH", { id: item.id, action: item.status === "pending" ? "approve" : item.status === "active" ? "pause" : "resume" })}>{item.status === "pending" ? "Approve" : item.status === "active" ? "Pause" : "Resume"}</button>
          {item.pendingAction && <><span className="text-xs text-amber-700">Agent requests: {item.pendingAction}</span><button type="button" disabled={busy} className="rounded border border-orange-400 px-2 py-1" onClick={() => void send("PATCH", { id: item.id, action: "approve_action" })}>Approve change</button><button type="button" disabled={busy} className="rounded border px-2 py-1" onClick={() => void send("PATCH", { id: item.id, action: "reject_action" })}>Reject change</button></>}
          {item.status === "pending" && <span className="text-xs text-amber-600">Agent suggestion — requires your approval.</span>}
          <button disabled={busy} className="rounded border px-2 py-1" onClick={() => {
            setEditing(item.id); setTitle(item.title); setPrompt(item.prompt); setProjectId(item.projectId);
            setKind(item.spec.kind); setTimezone(item.spec.timezone);
            setLocalTime(item.spec.localTime ?? "08:00"); setWatchUrl(item.spec.url ?? ""); setEveryMinutes(item.spec.everyMinutes ?? 60); setWeekdays(item.spec.weekdays ?? [1,2,3,4,5]);
            setRunAt(item.spec.runAt ? formatLocalScheduleInstant(item.spec.runAt, item.spec.timezone) : "");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}>Edit</button>
          <button disabled={busy || item.status !== "active"} className="rounded border px-2 py-1" onClick={() => void send("PATCH", { id: item.id, action: "run" })}>Run now</button>
          <button disabled={busy} className="rounded border px-2 py-1 text-red-600" onClick={() => {
            if (window.confirm("Delete this schedule?")) void send("PATCH", { id: item.id, action: "delete" });
          }}>Delete</button>
        </div>
        {item.runs.length > 0 && <details className="text-xs"><summary>Execution history</summary>
          {item.runs.slice().reverse().map(run => <p key={run.occurrence}>{new Date(run.occurrence).toLocaleString()} · {run.status} {run.summary || run.taskId || ""} {run.error || ""}{run.changed ? " · Changed" : ""}</p>)}
        </details>}
      </article>)}
    </div>
  </section>;
}
