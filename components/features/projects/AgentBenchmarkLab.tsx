"use client";
import { useCallback, useEffect, useState } from "react";
import type { BrowserBenchmarkReport, BrowserBenchmarkResult } from "@/lib/project-agent/benchmark/browser-runner";
type Saved = { _id: string; createdAt: string; mode: "browser" | "model";
  report: BrowserBenchmarkReport | Array<{ id: string; passed: boolean; rounds: number; inputTokens: number; outputTokens: number; error?: string }> };
export function AgentBenchmarkLab() {
  const [runs, setRuns] = useState<Saved[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    const r = await fetch("/api/project-agent/benchmark", { cache: "no-store" });
    if (!r.ok) throw new Error("Benchmark records unavailable");
    setRuns(((await r.json()) as { reports: Saved[] }).reports);
  }, []);
  useEffect(() => { void reload().catch(e => setError(String(e))); }, [reload]);
  async function run(mode: "browser" | "model") {
    setWorking(true); setError("");
    try {
      if (mode === "model" && !window.confirm("This run uses the configured Dify model and can consume paid tokens. Continue?"))
        return;
      const r = await fetch("/api/project-agent/benchmark", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }),
      });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "Benchmark failed");
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Benchmark unavailable"); }
    finally { setWorking(false); }
  }
  return <section className="mx-auto max-w-5xl space-y-4 p-4" aria-label="Agent Real-World Benchmark Lab">
    <h1 className="text-xl font-semibold">Agent Browser Benchmark Lab</h1>
    <p className="text-sm text-slate-500">Isolated Chromium tests using 40 synthetic interactive pages. No real accounts, user sites or cookies. Model-assisted tests are optional and charge model tokens.</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={working} onClick={() => void run("browser")}
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
        {working ? "Running evaluation…" : "Run 40 browser scenarios"}</button>
      <button type="button" disabled={working} onClick={() => void run("model")}
        className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">
        Run 5 model-planned scenarios</button>
    </div>
    {runs.map(item => {
      const cases = Array.isArray(item.report) ? item.report : item.report.cases;
      const passed = cases.filter(c => c.passed).length;
      return <article className="rounded-xl border p-3" key={item._id}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm">{item.mode === "model" ? "Model-planned Browser Agent" : "Scripted real Chromium"}</strong>
          <span className="font-mono text-sm">{passed}/{cases.length} PASS</span>
        </div>
        <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
        <details className="mt-2 text-xs">
          <summary>Case details</summary>
          <div className="mt-2 max-h-64 space-y-1 overflow-auto">
            {cases.map((c: BrowserBenchmarkResult | { id: string; passed: boolean; error?: string }) =>
              <p key={c.id} className={c.passed ? "text-green-700" : "text-red-600"}>
                {c.passed ? "PASS" : "FAIL"} · {c.id} {c.error ?? ""}
              </p>)}
          </div>
        </details>
      </article>;
    })}
  </section>;
}
