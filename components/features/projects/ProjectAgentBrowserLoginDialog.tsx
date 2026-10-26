"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ActivityLanguage } from "@/lib/project-agent/activity-language";
import { browserLoginText } from "@/lib/project-agent/browser-assist-labels";

export function ProjectAgentBrowserLoginDialog({ base, onClose, language = "en" }: { base: string; onClose: () => void; language?: ActivityLanguage }) {
  const ui = browserLoginText(language);
  const [host, setHost] = useState("");
  const [secret, setSecret] = useState("");
  const [mode, setMode] = useState<"read" | "interact">("read");
  const [automation, setAutomation] = useState(false);
  const [ssoHosts, setSsoHosts] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function command(payload: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch(base + "/control", { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string; host?: string; grant?: { host: string } };
      if (!response.ok) throw new Error(data.error ?? "Private login is unavailable");
      if (payload.op === "login_begin") setHost(data.host ?? "");
      if (payload.op === "login_save") setHost(data.grant?.host ?? host);
      setSecret("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Private login is unavailable"); }
    finally { setBusy(false); }
  }
  useEffect(() => { void command({ op: "login_begin" }); }, []);

  return <div role="dialog" aria-modal="true" aria-labelledby="private-login-title"
    className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4">
    <section className="w-full max-w-md space-y-3 rounded-xl border bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <header className="flex items-center gap-2"><h2 id="private-login-title" className="flex-1 font-semibold">{ui.title}</h2>
        <button type="button" aria-label={ui.close} onClick={onClose} className="rounded p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
      </header>
      <p className="text-xs text-slate-500">{ui.privacy}</p>
      {host && <p className="text-sm">{ui.website}: <strong>{host}</strong></p>}
      <form autoComplete="off" onSubmit={(event) => { event.preventDefault(); if (secret) void command({ op: "login_secret", text: secret }); }} className="flex gap-2">
        <input autoFocus type="password" autoComplete="off" value={secret} maxLength={2048}
          onChange={(event) => setSecret(event.target.value)} placeholder={ui.secret}
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm dark:bg-slate-950" />
        <button type="submit" disabled={busy || !secret} className="rounded-md border px-3 text-sm disabled:opacity-50">{ui.enterSecret}</button>
      </form>
      <button type="button" disabled={busy} onClick={() => void command({ op: "login_submit" })}
        className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">{ui.submit}</button>
      <label className="flex items-center gap-2 text-sm">{ui.access}
        <select value={mode} onChange={(event) => setMode(event.target.value as "read" | "interact")} className="rounded border px-2 py-1 dark:bg-slate-950">
          <option value="read">{ui.read}</option><option value="interact">{ui.interact}</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={automation} onChange={(event) => setAutomation(event.target.checked)} /> {ui.automation}</label>
      <label className="block text-xs text-slate-500">{ui.relatedSso}
        <input value={ssoHosts} onChange={(event) => setSsoHosts(event.target.value)} placeholder="login.example.com"
          className="mt-1 w-full rounded border px-2 py-1.5 text-sm dark:bg-slate-950" />
      </label>
      <button type="button" disabled={busy || !host} onClick={() => void command({ op: "login_save", mode, automation,
        relatedHosts: ssoHosts.split(",").map(value => value.trim()).filter(Boolean) })}
        className="rounded-md border border-orange-400 px-3 py-2 text-sm disabled:opacity-50">{ui.save}</button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </section>
  </div>;
}
