"use client";
import { useCallback, useEffect, useState } from "react";
import type { HarnessVariant, HarnessDimension } from "@/lib/project-agent/harness-lab/types";
interface Outcome { count: number; failed: number }
type LabResponse = { variants: HarnessVariant[]; enabled: boolean; liveEnabled: boolean;
  counts: Array<{ id: string; trial: Outcome; control: Outcome }> };
const DIMENSIONS: HarnessDimension[] = ["approach","tools","delegation","skills"];
export function AgentHarnessLab() {
  const [data, setData] = useState<LabResponse>({ variants: [], counts: [], enabled: false, liveEnabled: false });
  const [title, setTitle] = useState("");
  const [domain, setDomain] = useState("general");
  const [dimension, setDimension] = useState<HarnessDimension>("approach");
  const [guidance, setGuidance] = useState("");
  const [trace, setTrace] = useState("");
  const [selectedFirst, setSelectedFirst] = useState<string>("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/project-agent/harness-lab", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load Harness Lab");
    setData(await response.json() as LabResponse);
  }, []);
  useEffect(() => {
    void refresh().catch(error => setError(String(error)));
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function send(op: string, payload: object) {
    setBusy(op + JSON.stringify(payload).slice(0,25)); setError(""); setMessage("");
    try {
      const response = await fetch("/api/project-agent/harness-lab", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, ...payload }),
      });
      const result = await response.json() as { error?: string; variant?: HarnessVariant };
      if (!response.ok) throw new Error(result.error || "Could not complete harness operation");
      await refresh();
      setMessage(op === "evaluate" ? "Offline comparison queued. Check evidence when it finishes."
        : op === "propose" ? "Draft created; review before testing." : "Harness operation saved.");
      if (op === "create") { setTitle(""); setGuidance(""); }
      if (op === "propose") setTrace("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(""); }
  }
  const inputClass = "w-full rounded-md border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900";
  return <section className="space-y-5" aria-label="Harness Optimization Lab">
    <div>
      <h1 className="text-xl font-semibold">Harness Optimization Lab</h1>
      <p className="mt-1 text-sm text-slate-500">
        Compare bounded approach/tool/skill guidance offline, then release in controlled canary.
        Security policies, browser credentials and tool permissions cannot be edited here.
      </p>
      <p className="mt-1 text-xs text-slate-500">Lab: {data.enabled ? "enabled" : "disabled"} · Live rollout: {data.liveEnabled ? "enabled" : "disabled"}</p>
    </div>
    {error && <p role="alert" className="rounded border border-red-300 p-2 text-sm text-red-600">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <div className="grid gap-4 md:grid-cols-2">
      <form className="space-y-3 rounded-xl border p-4" onSubmit={event => { event.preventDefault(); void send("create", { title, domain, dimension, guidance }); }}>
        <h2 className="font-semibold">Create a candidate</h2>
        <label className="block text-sm">Title<input className={inputClass} value={title} maxLength={100} onChange={e => setTitle(e.target.value)} required /></label>
        <label className="block text-sm">Domain
          <select className={inputClass} value={domain} onChange={e => setDomain(e.target.value)}>
            {["general","code","documents","research","education","agent"].map(x=><option value={x} key={x}>{x}</option>)}
          </select>
        </label>
        <label className="block text-sm">Optimization component
          <select className={inputClass} value={dimension} onChange={e => setDimension(e.target.value as HarnessDimension)}>
            {DIMENSIONS.map(x=><option value={x} key={x}>{x}</option>)}
          </select>
        </label>
        <label className="block text-sm">Bounded guidance (40–1800 chars)
          <textarea className={inputClass} rows={5} value={guidance} maxLength={1800}
            onChange={e => setGuidance(e.target.value)} required />
        </label>
        <button className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={Boolean(busy) || title.length < 1 || guidance.trim().length < 40}>Create draft</button>
      </form>
      <form className="space-y-3 rounded-xl border p-4" onSubmit={event => { event.preventDefault(); void send("propose", { domain, trace }); }}>
        <h2 className="font-semibold">Generate an improvement proposal</h2>
        <p className="text-xs text-slate-500">Use a short, anonymized failure pattern. Never paste a real login, private document, client data or API key.</p>
        <label className="block text-sm">What went wrong?
          <textarea className={inputClass} rows={7} value={trace} maxLength={2500}
            placeholder="The Agent repeatedly queried a tool although its previous response already contained the answer."
            onChange={e => setTrace(e.target.value)} required/>
        </label>
        <button className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
          disabled={Boolean(busy) || !data.enabled || trace.length < 30}>Suggest via model</button>
      </form>
    </div>
    <div className="space-y-3">
      <h2 className="font-semibold">Evidence and rollouts ({data.variants.length})</h2>
      {!data.variants.length && <p className="text-sm text-slate-500">No candidates yet.</p>}
      {selectedFirst && <div className="text-xs text-slate-500">Selected first for composition: {selectedFirst}
        <button className="ml-2 underline" type="button" onClick={() => setSelectedFirst("")}>Clear</button>
      </div>}
      {data.variants.map(variant => {
        const counts = data.counts.find(c => c.id === variant.id);
        return <article className="space-y-2 rounded-xl border p-4" key={variant.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm">{variant.title}</strong>
            <span className="rounded-full border px-2 py-0.5 text-xs">{variant.status}</span>
          </div>
          <p className="text-xs text-slate-500">{variant.domain} · {variant.dimension} · {variant.id} · v{variant.version}</p>
          <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-sm">{variant.guidance}</p>
          {variant.evidence && <div className="text-xs">
            <p>Comparison: {variant.evidence.baselineReference ? "parent "+variant.evidence.baselineReference : "default harness"}</p>
            <p>Offline pass: baseline {variant.evidence.basePass}/{variant.evidence.cases.length},
              candidate {variant.evidence.candidatePass}/{variant.evidence.cases.length} ·
              Tokens: {variant.evidence.baseTokens} → {variant.evidence.candidateTokens}</p>
            <p className="text-slate-500">{variant.evidence.reason}</p>
            <details className="mt-1"><summary className="cursor-pointer">Per-case evidence</summary>
              {variant.evidence.cases.map(c => <p className="py-0.5" key={c.caseId}>
                {c.caseId}: baseline {c.basePass ? "PASS" : "FAIL"}, candidate {c.candidatePass ? "PASS" : "FAIL"},
                tokens {c.baseTokens}/{c.candidateTokens}
              </p>)}
            </details>
          </div>}
          {counts && <p className="text-xs text-slate-500">Live canary: {counts.trial.count} trial
            ({counts.trial.failed} failed) · {counts.control.count} control ({counts.control.failed} failed)</p>}
          {variant.failure && <p className="text-xs text-red-600">{variant.failure}</p>}
          <div className="flex flex-wrap gap-2">
            {variant.evidence && <button type="button" disabled={Boolean(busy)||!data.enabled}
              onClick={() => void send("refine", { id: variant.id })}
              className="rounded border px-3 py-1.5 text-xs">Refine from evidence</button>}
            {variant.evidence?.improved && <button type="button" disabled={Boolean(busy)}
              onClick={() => { if (!selectedFirst) { setSelectedFirst(variant.id); return; }
                if (selectedFirst === variant.id) { setSelectedFirst(""); return; }
                void send("compose", { leftId: selectedFirst, rightId: variant.id }).then(() => setSelectedFirst(""));
              }} className="rounded border px-3 py-1.5 text-xs">
              {selectedFirst && selectedFirst !== variant.id ? "Compose selected with this" : "Select to compose"}
            </button>}
            {["draft","rejected","evaluated"].includes(variant.status) &&
              <button type="button" disabled={Boolean(busy)||!data.enabled} onClick={() => void send("evaluate", { id: variant.id })}
                className="rounded border px-3 py-1.5 text-xs">Run offline probe</button>}
            {variant.status === "evaluated" && variant.evidence?.improved &&
              <button type="button" disabled={Boolean(busy)||!data.liveEnabled} onClick={() => void send("canary", { id: variant.id })}
                className="rounded border px-3 py-1.5 text-xs">Start 20% canary</button>}
            {variant.status === "canary" && <button type="button" disabled={Boolean(busy)||!data.liveEnabled}
              onClick={() => { if (window.confirm("Promote after reviewing trial/control evidence?")) void send("promote", { id: variant.id }); }}
              className="rounded border px-3 py-1.5 text-xs">Promote to 100%</button>}
            {["canary","active"].includes(variant.status) &&
              <button type="button" disabled={Boolean(busy)||!data.liveEnabled}
                onClick={() => { if (window.confirm("Roll back this optimization immediately?")) void send("rollback", { id: variant.id }); }}
                className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-600">Rollback</button>}
          </div>
        </article>;
      })}
    </div>
  </section>;
}
