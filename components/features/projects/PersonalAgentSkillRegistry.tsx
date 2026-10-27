"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CircleHelp, Plus, Search, Sparkles } from "lucide-react";
import { AgentSkillCatalog } from "./AgentSkillCatalog";
import { PersonalAgentSkillCard } from "./PersonalAgentSkillCard";
import { PersonalAgentSkillEditor, type SkillDraft } from "./PersonalAgentSkillEditor";
import type { PersonalAgentSkill } from "@/lib/project-agent/personal-agent-skills";

type Section = "mine" | "discover";
type Filter = "all" | "enabled" | "disabled";
export function PersonalAgentSkillRegistry() {
  const [skills, setSkills] = useState<PersonalAgentSkill[]>([]);
  const [section, setSection] = useState<Section>("mine");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<PersonalAgentSkill | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/project-agent/personal-skills", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load your skills");
    const data = await response.json() as { skills: PersonalAgentSkill[] };
    setSkills(Array.isArray(data.skills) ? data.skills : []);
  }, []);
  useEffect(() => {
    void refresh().catch(e => setError(String(e))).finally(() => setLoading(false));
  }, [refresh]);
  const active = skills.filter(skill => skill.enabled).length;
  const visible = useMemo(() => skills.filter(skill =>
    (filter === "all" || (filter === "enabled" ? skill.enabled : !skill.enabled)) &&
    (skill.name + " " + skill.description + " " + skill.instructions).toLowerCase().includes(query.trim().toLowerCase())
  ), [skills, filter, query]);
  async function command(method: "POST" | "PATCH" | "DELETE", payload: object, success: string) {
    if (busy) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/project-agent/personal-skills", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Skill update failed");
      }
      const result = await response.json() as { skills: PersonalAgentSkill[] };
      if (Array.isArray(result.skills)) setSkills(result.skills); else await refresh();
      setNotice(success); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Skill update failed"); return false; }
    finally { setBusy(false); }
  }
  async function save(draft: SkillDraft) {
    const ok = await command("POST", draft, draft.id ? "Skill updated." : "Skill created. Enable it when ready.");
    if (ok) setEditor(undefined);
  }
  async function installed() {
    await refresh();
    setSection("mine"); setFilter("all"); setQuery("");
    setNotice("Skill added to your library. Review it before enabling.");
  }
  return <section aria-label="Personal Agent skill registry" className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl">
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
          <Sparkles className="h-4 w-4" aria-hidden="true"/> Personalize your agent
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Skills</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Give your agent reusable ways of working. Enabled skills are available across projects and
          applied when relevant—not run automatically as code.
        </p>
      </div>
      <button type="button" onClick={() => setEditor(null)}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950">
        <Plus className="h-4 w-4" aria-hidden="true"/> Create skill
      </button>
    </header>
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Skill library summary">
      {[["Installed", String(skills.length)], ["Enabled", String(active)], ["Ready to review", String(skills.length - active)]].map(([label, value]) =>
        <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        </div>)}
    </div>
    <div className="border-b border-slate-200 dark:border-slate-800" role="tablist" aria-label="Skill sections">
      {([["mine", "My skills"], ["discover", "Explore library"]] as const).map(([id, label]) =>
        <button key={id} type="button" role="tab" aria-selected={section === id}
          onClick={() => { setSection(id); setQuery(""); }}
          className={"-mb-px mr-6 border-b-2 pb-3 text-sm font-medium transition " +
            (section === id ? "border-slate-900 text-slate-950 dark:border-slate-100 dark:text-white" :
              "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200")}>{label}</button>)}
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <label className="relative min-w-52 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
        <input aria-label="Search skills" value={query} onChange={e => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm focus:outline-2 focus:outline-slate-400 dark:border-slate-700 dark:bg-slate-900"
          placeholder={section === "mine" ? "Search your skills" : "Search skill library"}/>
      </label>
      {section === "mine" && <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900" aria-label="Skill status filter">
        {(["all", "enabled", "disabled"] as const).map(item => <button type="button" key={item}
          aria-pressed={filter === item} onClick={() => setFilter(item)}
          className={"rounded-lg px-3 py-2 text-xs capitalize " +
            (filter === item ? "bg-white font-semibold shadow-sm dark:bg-slate-700" : "text-slate-500")}>
          {item === "disabled" ? "Off" : item}</button>)}
      </div>}
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">{notice}</p>}
    {section === "mine" && <div role="tabpanel" className="space-y-4">
      {loading ? <p role="status" className="text-sm text-slate-500">Loading your skills…</p> :
        visible.length ? <div className="grid gap-3 md:grid-cols-2">{visible.map(skill =>
          <PersonalAgentSkillCard key={skill.id} skill={skill} busy={busy}
            onEdit={setEditor}
            onToggle={item => void command("PATCH", { id: item.id, enabled: !item.enabled },
              item.enabled ? "Skill disabled." : "Skill enabled for matching tasks.")}
            onDelete={item => { if (window.confirm("Delete " + item.name + "?"))
              void command("DELETE", { id: item.id }, "Skill deleted."); }}/>)}</div> :
          <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-12 text-center dark:border-slate-700">
            <BookOpen className="mx-auto mb-3 h-7 w-7 text-slate-400"/>
            <h2 className="font-semibold">{skills.length ? "No matching skills" : "Your skill library is empty"}</h2>
            <p className="mt-2 text-sm text-slate-500">{skills.length ?
              "Try a different search or filter." : "Create a skill or browse curated guidance to get started."}</p>
            {!skills.length && <button type="button" onClick={() => setSection("discover")}
              className="mt-4 rounded-lg border px-4 py-2 text-sm">Explore library</button>}
          </div>}
    </div>}
    {section === "discover" && <div role="tabpanel">
      <AgentSkillCatalog installedNames={skills.map(item => item.name)} query={query} onInstalled={installed}/>
    </div>}
    <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900/40">
      <CircleHelp className="mt-0.5 h-4 w-4 shrink-0"/>
      <p>Skills help guide the agent on relevant tasks. They do not grant tools, bypass approvals
        or guarantee an action was performed. Check task activity for actual results.</p>
    </div>
    <PersonalAgentSkillEditor open={editor !== undefined} skill={editor ?? null}
      busy={busy} onClose={() => setEditor(undefined)} onSave={draft => void save(draft)}/>
  </section>;
}
