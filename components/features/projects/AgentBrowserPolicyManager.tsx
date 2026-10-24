"use client";
import { useCallback, useEffect, useState } from "react";
import type { BrowserSitePolicy, BrowserPolicyMode } from "@/lib/project-agent/browser-security-policy";
export function AgentBrowserPolicyManager() {
  const [policies, setPolicies] = useState<BrowserSitePolicy[]>([]);
  const [host, setHost] = useState("");
  const [mode, setMode] = useState<BrowserPolicyMode>("read");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const r = await fetch("/api/project-agent/browser-policies", { cache: "no-store" });
    if (!r.ok) throw new Error("Browser policies unavailable");
    setPolicies(((await r.json()) as { policies: BrowserSitePolicy[] }).policies);
  }, []);
  useEffect(() => { void refresh().catch(e => setError(String(e))); }, [refresh]);
  async function apply(domain: string, value: BrowserPolicyMode) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/project-agent/browser-policies", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: domain, mode: value }),
      });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "Policy update failed");
      await refresh(); setHost("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Policy unavailable"); }
    finally { setBusy(false); }
  }
  return <section aria-label="Agent browser policies" className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">Browser site policies</h2>
    <p className="text-sm text-slate-500">Exact HTTPS hosts only. These restrictions apply to all Projects and scheduled tasks. Login Vault permissions are separate. Sensitive submissions still require approval.</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); if (host.trim()) void apply(host.trim(), mode); }}>
      <input aria-label="Website domain" placeholder="example.com" value={host} maxLength={255}
        onChange={e => setHost(e.target.value)} className="min-w-0 flex-1 rounded border p-2 text-sm dark:bg-slate-900"/>
      <select aria-label="Website policy" value={mode} onChange={e => setMode(e.target.value as BrowserPolicyMode)}
        className="rounded border p-2 text-sm dark:bg-slate-900">
        <option value="read">Read only</option><option value="interact">Allow interaction</option>
        <option value="deny">Block website</option>
      </select>
      <button type="submit" disabled={busy || !host.trim()}
        className="rounded bg-slate-900 px-3 py-2 text-xs text-white">Save</button>
    </form>
    {policies.map(p => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2">
      <strong className="text-sm">{p.hostname}</strong>
      <div className="flex items-center gap-2">
        <select aria-label={"Policy for " + p.hostname} value={p.mode} disabled={busy}
          onChange={e => void apply(p.hostname, e.target.value as BrowserPolicyMode)}
          className="rounded border p-1 text-xs dark:bg-slate-900">
          <option value="read">Read only</option><option value="interact">Interact</option>
          <option value="deny">Blocked</option><option value="inherit">Default</option>
        </select>
        <button type="button" disabled={busy} onClick={() => void apply(p.hostname,"inherit")}
          className="rounded border px-2 py-1 text-xs">Remove</button>
      </div>
    </div>)}
  </section>;
}
