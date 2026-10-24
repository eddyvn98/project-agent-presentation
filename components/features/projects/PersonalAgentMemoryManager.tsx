"use client";
import { useCallback, useEffect, useState } from "react";
import type { PersonalAgentMemory } from "@/lib/project-agent/personal-agent-memory";

export function PersonalAgentMemoryManager() {
  const [memory, setMemory] = useState<PersonalAgentMemory | null>(null);
  const [draft, setDraft] = useState("");
  const [category, setCategory] = useState<"preference" | "workflow" | "context">("preference");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    const r = await fetch("/api/project-agent/personal-memory", { cache: "no-store" });
    if (!r.ok) throw new Error("Encrypted memory is not available");
    setMemory(((await r.json()) as { memory: PersonalAgentMemory }).memory);
  }, []);
  useEffect(() => { void reload().catch(e => setError(String(e))); }, [reload]);
  async function change(method: "POST" | "PATCH" | "DELETE", body: object) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/project-agent/personal-memory", { method,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Memory update failed");
      
      await reload();
      if (method === "POST") setDraft("");
    } catch (error) { setError(error instanceof Error ? error.message : "Memory unavailable"); }
    finally { setBusy(false); }
  }
  return <section aria-label="Personal Agent memory" className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">Personal Agent memory</h2>
    <p className="text-sm text-slate-500">Optional encrypted facts shared across your Projects. Only facts you approve are used; turn it off at any time.</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={memory?.enabled ?? false} disabled={!memory || busy}
        onChange={e => void change("PATCH", { enabled: e.target.checked })} />
      Use my personal memory in Agent conversations
    </label>
    <form className="space-y-2" onSubmit={e => {
      e.preventDefault(); if (draft.trim()) void change("POST", { text: draft, category });
    }}>
      <textarea className="w-full rounded-lg border p-2 text-sm dark:bg-slate-900"
        rows={2} maxLength={400} value={draft} onChange={e => setDraft(e.target.value)}
        placeholder="Add a useful preference, workflow rule or fact (review before saving)"/>
      <div className="flex items-center gap-2">
        <select value={category} onChange={e => setCategory(e.target.value as typeof category)}
          className="rounded-lg border p-2 text-sm dark:bg-slate-900">
          <option value="preference">Preference</option><option value="workflow">Workflow</option>
          <option value="context">Context</option>
        </select>
        <button type="submit" disabled={busy || draft.trim().length < 4}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">Save fact</button>
      </div>
    </form>
    {memory?.facts.slice().reverse().map(f => <div className="flex items-start justify-between gap-2 rounded-lg border p-2" key={f.id}>
      <div className="min-w-0"><p className="break-words text-sm">{f.text}</p>
        <p className="text-xs text-slate-400">{f.category} · {new Date(f.createdAt).toLocaleDateString()}</p></div>
      <button type="button" disabled={busy} className="shrink-0 rounded border px-2 py-1 text-xs text-red-600"
        onClick={() => void change("DELETE", { id: f.id })}>Delete</button>
    </div>)}
  </section>;
}
