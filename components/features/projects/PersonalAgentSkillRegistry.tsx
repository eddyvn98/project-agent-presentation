"use client";
import { useCallback, useEffect, useState } from "react";
import { AgentSkillCatalog } from "./AgentSkillCatalog";
import type { PersonalAgentSkill } from "@/lib/project-agent/personal-agent-skills";
export function PersonalAgentSkillRegistry() {
  const [skills, setSkills] = useState<PersonalAgentSkill[]>([]);
  const [name, setName] = useState(""), [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState(""), [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const r = await fetch("/api/project-agent/personal-skills", { cache: "no-store" });
    if (!r.ok) throw new Error("Could not load personal skills");
    setSkills(((await r.json()) as { skills: PersonalAgentSkill[] }).skills);
  }, []);
  useEffect(() => { void refresh().catch(e => setError(String(e))); }, [refresh]);
  async function command(method: "POST" | "PATCH" | "DELETE", body: object) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/project-agent/personal-skills", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "Skill update failed");
      await refresh();
      if (method === "POST") clear();
    } catch (e) { setError(e instanceof Error ? e.message : "Skill Registry unavailable"); }
    finally { setBusy(false); }
  }
  function clear() { setName(""); setDescription(""); setInstructions(""); setEditing(null); }
  function edit(skill: PersonalAgentSkill) {
    setEditing(skill.id); setName(skill.name); setDescription(skill.description);
    setInstructions(skill.instructions); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const field = "w-full rounded-lg border p-2 text-sm dark:border-slate-700 dark:bg-slate-900";
  return <section className="mx-auto max-w-4xl space-y-4 p-4" aria-label="Personal Agent skill registry">
    <header><h1 className="text-xl font-semibold">Personal Skill Registry</h1>
      <p className="text-sm text-slate-500">Reusable instructions for your Agent across Projects. Only enabled skills are supplied to the Agent as advisory context.</p></header>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <form className="space-y-2 rounded-xl border p-4" onSubmit={event => {
      event.preventDefault();
      if (name.trim() && instructions.trim()) void command("POST", {
        ...(editing ? { id: editing } : {}), name, description, instructions,
      });
    }}>
      <h2 className="font-semibold">{editing ? "Edit skill" : "Add skill"}</h2>
      <input value={name} maxLength={100} onChange={e => setName(e.target.value)}
        className={field} placeholder="Skill name" aria-label="Skill name" required/>
      <input value={description} maxLength={240} onChange={e => setDescription(e.target.value)}
        className={field} placeholder="What this skill helps with" aria-label="Skill description"/>
      <textarea rows={7} value={instructions} maxLength={6000} onChange={e => setInstructions(e.target.value)}
        className={field} placeholder="Write step-by-step instructions for your Agent" aria-label="Skill instructions" required/>
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !name || instructions.trim().length < 15}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {editing ? "Save revision" : "Create skill"}
        </button>
        {editing && <button type="button" onClick={clear} className="rounded-lg border px-3 py-2 text-sm">Cancel</button>}
      </div>
    </form>
    <AgentSkillCatalog />
    {skills.map(skill => <article className="space-y-2 rounded-xl border p-3" key={skill.id}>
      <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{skill.name}</strong>
        <span className="text-xs text-slate-400">v{skill.version}</span></div>
      <p className="text-sm text-slate-500">{skill.description}</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox"
          checked={skill.enabled} disabled={busy} onChange={e => void command("PATCH", { id: skill.id, enabled: e.target.checked })}/>
          Enabled across Projects</label>
        <button type="button" onClick={() => edit(skill)} className="rounded border px-2 py-1 text-xs">Edit</button>
        <button type="button" disabled={busy} onClick={() => {
          if (window.confirm("Delete this skill?")) void command("DELETE", { id: skill.id });
        }} className="rounded border px-2 py-1 text-xs text-red-600">Delete</button>
      </div>
      <details className="text-xs text-slate-500"><summary>View instructions</summary>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-2 dark:bg-slate-900">{skill.instructions}</pre></details>
    </article>)}
  </section>;
}
