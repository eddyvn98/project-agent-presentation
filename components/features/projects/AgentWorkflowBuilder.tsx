"use client";
import { useCallback, useEffect, useState } from "react";
import type { AgentWorkflow, AgentWorkflowRun, AgentWorkflowStep } from "@/lib/project-agent/workflow-types";
type Project = { id: string; name: string };
const newStep = (): AgentWorkflowStep => ({
  id: "step_" + Math.random().toString(36).slice(2, 9),
  title: "", prompt: "", requiresApproval: false, onFailure: "stop",
});
export function AgentWorkflowBuilder() {
  const [workflows, setWorkflows] = useState<AgentWorkflow[]>([]);
  const [runs, setRuns] = useState<AgentWorkflowRun[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState(""), [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [steps, setSteps] = useState<AgentWorkflowStep[]>([newStep()]);
  const [editing, setEditing] = useState<string | null>(null);
  const [pendingInputs, setPendingInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    const r = await fetch("/api/project-agent/workflows", { cache: "no-store" });
    if (!r.ok) throw new Error("Could not load workflows");
    const data = await r.json() as { workflows: AgentWorkflow[]; runs: AgentWorkflowRun[] };
    setWorkflows(data.workflows); setRuns(data.runs);
  }, []);
  useEffect(() => {
    void reload().catch(e => setError(String(e)));
    const timer = setInterval(() => void reload().catch(() => {}), 7000);
    void fetch("/api/projects").then(r => r.ok ? r.json() : [])
      .then((items: Project[]) => { if (Array.isArray(items)) {
        setProjects(items); setProjectId(id => id || items[0]?.id || "");
      }}).catch(() => {});
    return () => clearInterval(timer);
  }, [reload]);
  function reset() {
    setEditing(null); setTitle(""); setDescription(""); setSteps([newStep()]);
  }
  function edit(w: AgentWorkflow) {
    setEditing(w.id); setTitle(w.title); setDescription(w.description);
    setProjectId(w.projectId); setSteps(w.steps.map(s => ({ ...s })));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function changeStep(index: number, field: keyof AgentWorkflowStep, value: string | boolean) {
    setSteps(old => old.map((s,i) => i === index ? { ...s, [field]: value } : s));
  }
  function changeRoute(index: number, field: "contains" | "onMatch" | "onOther", value: string) {
    setSteps(old => old.map((s,i) => {
      if (i !== index) return s;
      if (field === "contains" && !value.trim()) return { ...s, route: undefined };
      return { ...s, route: { contains: s.route?.contains ?? "",
        onMatch: s.route?.onMatch ?? "next", onOther: s.route?.onOther ?? "next",
        [field]: value } };
    }));
  }
  function move(index: number, diff: number) {
    setSteps(old => { const copy = [...old], target = index + diff;
      if (target < 0 || target >= copy.length) return old;
      [copy[index],copy[target]] = [copy[target],copy[index]]; return copy; });
  }
  async function send(method: "POST" | "PATCH", body: object) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/project-agent/workflows", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "Workflow operation failed");
      await reload();
      if (method === "POST") reset();
    } catch (e) { setError(e instanceof Error ? e.message : "Workflow unavailable"); }
    finally { setBusy(false); }
  }
  const field = "w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900";
  return <section aria-label="Agent workflow builder" className="mx-auto max-w-5xl space-y-5 p-4">
    <header><h1 className="text-xl font-semibold">Workflow Builder</h1>
      <p className="text-sm text-slate-500">Create repeatable multi-step Agent processes. Optional approval gates prevent a step from starting until you authorize it.</p></header>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <form className="space-y-3 rounded-xl border p-4" onSubmit={e => {
      e.preventDefault();
      void send("POST", { ...(editing ? { id: editing } : {}), projectId, title, description, steps });
    }}>
      <h2 className="font-semibold">{editing ? "Edit workflow" : "New workflow"}</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">Name<input className={field} maxLength={120} value={title}
          onChange={e => setTitle(e.target.value)} required/></label>
        <label className="text-sm">Destination Project<select className={field} value={projectId}
          onChange={e => setProjectId(e.target.value)}>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
      </div>
      <label className="block text-sm">Description<input value={description} maxLength={500}
        onChange={e => setDescription(e.target.value)} className={field}/></label>
      {steps.map((step,i) => <article className="space-y-2 rounded-lg border p-3" key={step.id}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm">Step {i+1}</strong>
          <div className="flex gap-1">
            <button type="button" onClick={() => move(i,-1)} disabled={i===0} className="rounded border px-2 py-1 text-xs">↑</button>
            <button type="button" onClick={() => move(i,1)} disabled={i===steps.length-1} className="rounded border px-2 py-1 text-xs">↓</button>
            <button type="button" onClick={() => setSteps(old => old.filter((_,n)=>n!==i))}
              disabled={steps.length===1} className="rounded border px-2 py-1 text-xs text-red-600">Remove</button>
          </div>
        </div>
        <input className={field} placeholder="Step title" value={step.title} maxLength={100}
          onChange={e => changeStep(i,"title",e.target.value)} required/>
        <textarea className={field} placeholder="What should the Agent do?" rows={3} maxLength={2400}
          value={step.prompt} onChange={e => changeStep(i,"prompt",e.target.value)} required/>
        <label className="block text-xs">On step failure
          <select className={field} value={step.onFailure ?? "stop"}
            onChange={e => changeStep(i, "onFailure", e.target.value)}>
            <option value="stop">Stop workflow</option><option value="next">Continue with next step</option>
          </select>
        </label>
        {i < steps.length-1 && <div className="space-y-2 rounded border p-2">
          <label className="block text-xs">If successful result includes (optional)
            <input className={field} maxLength={120} value={step.route?.contains ?? ""}
              onChange={e => changeRoute(i,"contains",e.target.value)} placeholder="e.g. urgent" />
          </label>
          {step.route?.contains && (["onMatch","onOther"] as const).map(field => <label key={field} className="block text-xs">
            {field === "onMatch" ? "When matched" : "Otherwise"}
            <select className={field === "onMatch" ? "w-full rounded border p-2 text-sm" : "w-full rounded border p-2 text-sm"}
              value={step.route?.[field] ?? "next"} onChange={e => changeRoute(i, field, e.target.value)}>
              <option value="next">Next step</option><option value="stop">Finish</option>
              {steps.slice(i+1).map((_,j) => <option value={"step_"+(i+j+2)} key={j}>
                Jump to step {i+j+2}</option>)}
            </select>
          </label>)}
        </div>}
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={step.requiresApproval}
            onChange={e => changeStep(i,"requiresApproval",e.target.checked)}/>
          Ask me before executing this step
        </label>
      </article>)}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={steps.length >= 12} onClick={() => setSteps(old => [...old,newStep()])}
          className="rounded-lg border px-3 py-2 text-sm">Add step</button>
        <button type="submit" disabled={busy || !title || !projectId || steps.some(s => !s.title.trim() || !s.prompt.trim())}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {editing ? "Save workflow" : "Create workflow"}</button>
        {editing && <button type="button" onClick={reset} className="rounded-lg border px-3 py-2 text-sm">Cancel</button>}
      </div>
    </form>
    <div className="space-y-3"><h2 className="font-semibold">Saved workflows ({workflows.length})</h2>
      {workflows.map(w => <article className="space-y-2 rounded-xl border p-3" key={w.id}>
        <div className="flex flex-wrap justify-between gap-2"><strong>{w.title}</strong>
          <span className="text-xs text-slate-500">{w.enabled ? "Enabled" : "Disabled"} · {w.steps.length} steps</span></div>
        <p className="text-sm text-slate-500">{w.description}</p>
        <p className="text-xs text-slate-500">{w.steps.map(s => s.title + (s.requiresApproval ? " [approval]" : "")).join(" → ")}</p>
        <div className="flex flex-wrap gap-2">
          <button className="rounded border px-2 py-1 text-xs" onClick={() => edit(w)}>Edit</button>
          <button className="rounded border px-2 py-1 text-xs" disabled={busy || !w.enabled}
            onClick={() => void send("PATCH", { id: w.id, action: "run" })}>Run now</button>
          <button className="rounded border px-2 py-1 text-xs" disabled={busy}
            onClick={() => void send("PATCH", { id: w.id, action: w.enabled ? "disable" : "enable" })}>{w.enabled ? "Disable" : "Enable"}</button>
          <button className="rounded border px-2 py-1 text-xs text-red-600" disabled={busy}
            onClick={() => { if (window.confirm("Delete workflow?")) void send("PATCH", { id: w.id, action: "delete" }); }}>Delete</button>
        </div>
        {runs.filter(r => r.workflowId === w.id).slice(0,5).map(run => <div key={run.id}
          className="space-y-1 rounded-lg border bg-slate-50 p-2 text-xs dark:bg-slate-900">
          <p>Run {run.id.slice(-8)} · {run.status} · Step {Math.min(run.index+1,run.steps.length)}/{run.steps.length}</p>
          {run.error && <p role="alert" className="text-red-600">{run.error}</p>}
          {run.history.map(h => <p key={h.taskId ?? (h.index + ":" + h.completedAt)}>{h.title}: {h.status} {h.taskId ?? ""}</p>)}
          {run.status === "waiting_input" && <div className="space-y-2">
            <p role="status">Input needed: {run.requestedInput}</p>
            {run.inputReviewRequired && <p className="text-amber-700">Review previous tool effects before resuming.</p>}
            <textarea className={field} aria-label="Workflow missing input" maxLength={4000}
              value={pendingInputs[run.id] ?? ""} onChange={e => setPendingInputs(old => ({ ...old, [run.id]: e.target.value }))}/>
            <button type="button" disabled={busy || !pendingInputs[run.id]?.trim()}
              onClick={() => { const reviewed = !run.inputReviewRequired || window.confirm("Have you reviewed earlier tool effects and approved continuing?"); if (reviewed) void send("PATCH", { id: run.id, action: "provide_input", input: pendingInputs[run.id], reviewed }); }}
              className="rounded border px-2 py-1">Continue with input</button>
          </div>}
          {run.status === "waiting_approval" && <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void send("PATCH", { id: run.id, action: "approve_step" })}
              className="rounded bg-slate-900 px-2 py-1 text-white">Approve next step</button>
            <button type="button" disabled={busy} onClick={() => void send("PATCH", { id: run.id, action: "reject_step" })}
              className="rounded border px-2 py-1">Reject</button>
          </div>}
        </div>)}
      </article>)}
    </div>
  </section>;
}
