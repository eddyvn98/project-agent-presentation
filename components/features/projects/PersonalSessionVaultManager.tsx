"use client";

import { useCallback, useEffect, useState } from "react";

interface Grant { host: string; mode: "read" | "interact"; automation: boolean; expiresAt: string; savedAt: string }
export function PersonalSessionVaultManager() {
  const [items, setItems] = useState<Grant[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/project-agent/personal-vault", { cache: "no-store" });
    if (!response.ok) throw new Error("Cannot load personal website logins");
    const data = await response.json() as { sites: Grant[] };
    setItems(data.sites);
  }, []);
  useEffect(() => { void load().catch((cause) => setError(String(cause))); }, [load]);
  async function modify(grant: Grant, operation: "PATCH" | "DELETE", automation = grant.automation, mode = grant.mode) {
    setBusy(grant.host); setError("");
    try {
      const response = await fetch("/api/project-agent/personal-vault", {
        method: operation, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://" + grant.host, automation, mode }),
      });
      if (!response.ok) throw new Error("Website permission change failed");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Vault unavailable"); }
    finally { setBusy(""); }
  }
  return <section aria-label="Personal website sessions" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
    <h2 className="text-lg font-semibold">Saved website access</h2>
    <p className="text-sm text-slate-500">Encrypted logins belong to your account across all projects. Unattended agent access is opt-in per website.</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {!items.length && <p className="text-sm text-slate-500">No saved website sessions. Sign in through Browser Preview first.</p>}
    {items.map(item => <div className="space-y-2 rounded-lg border p-3" key={item.host}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm">{item.host}</strong>
        <button type="button" disabled={busy === item.host} className="rounded border px-2 py-1 text-xs text-red-600"
          onClick={() => { if (window.confirm("Revoke this website login?")) void modify(item, "DELETE"); }}>Revoke</button>
      </div>
      <p className="text-xs text-slate-500">Expires {new Date(item.expiresAt).toLocaleDateString()}</p>
      <label className="flex items-center gap-2 text-sm">Access
        <select className="rounded border p-1" value={item.mode} disabled={busy === item.host}
          onChange={event => void modify(item, "PATCH", item.automation, event.target.value as Grant["mode"])}>
          <option value="read">Read only</option><option value="interact">Interact</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={item.automation} disabled={busy === item.host}
          onChange={event => void modify(item, "PATCH", event.target.checked)} />
        Allow unattended tasks to reuse login
      </label>
    </div>)}
  </section>;
}
