"use client";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Plus, SearchX } from "lucide-react";
import type { SkillCatalogEntry } from "@/lib/project-agent/skill-catalog";

interface Props { installedNames: string[]; query: string; onInstalled(): Promise<void> }
type Entry = Omit<SkillCatalogEntry, "instructions">;
export function AgentSkillCatalog({ installedNames, query, onInstalled }: Props) {
  const [skills, setSkills] = useState<Entry[]>([]);
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const known = useMemo(() => new Set(installedNames.map(s => s.trim().toLowerCase())), [installedNames]);
  const categories = ["All", ...new Set(skills.map(item => item.category))];
  const filtered = skills.filter(item =>
    (category === "All" || item.category === category) &&
    (item.name + " " + item.category + " " + item.description).toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    let alive = true;
    void fetch("/api/project-agent/skill-catalog", { cache: "no-store" })
      .then(async r => { if (!r.ok) throw new Error("Skill library unavailable"); return r.json(); })
      .then((data: { catalog?: Entry[] }) => { if (alive) setSkills(data.catalog ?? []); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "Skill library unavailable"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  async function install(item: Entry) {
    if (busy || known.has(item.name.trim().toLowerCase())) return;
    setBusy(item.id); setError("");
    try {
      const r = await fetch("/api/project-agent/skill-catalog", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }),
      });
      if (!r.ok) { const data = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Could not add skill"); }
      await onInstalled();
    } catch (e) { setError(e instanceof Error ? e.message : "Skill unavailable"); }
    finally { setBusy(""); }
  }
  return <section aria-label="Discover agent skills" className="space-y-5">
    <div className="flex flex-wrap gap-2" aria-label="Skill categories">
      {categories.map(item => <button key={item} type="button" onClick={() => setCategory(item)}
        aria-pressed={category === item}
        className={"rounded-full border px-3 py-1.5 text-xs font-medium transition " +
          (category === item ? "border-slate-900 bg-slate-900 text-white dark:border-slate-200 dark:bg-slate-100 dark:text-slate-900" :
            "border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800")}>{item}</button>)}
    </div>
    {error && <p role="alert" className="rounded-lg border border-red-200 p-3 text-sm text-red-700">{error}</p>}
    {loading && <p role="status" className="text-sm text-slate-500">Loading skill library…</p>}
    {!loading && filtered.length === 0 && <p className="flex items-center gap-2 rounded-xl border p-6 text-sm text-slate-500">
      <SearchX className="h-5 w-5"/> No skills match your search.</p>}
    <div className="grid gap-3 md:grid-cols-2">
      {filtered.map(item => {
        const installed = known.has(item.name.trim().toLowerCase());
        return <article key={item.id} className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <div><div className="mb-3 flex items-center justify-between">
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{item.category}</span>
            <BookOpen className="h-4 w-4 text-slate-400" aria-hidden="true"/>
          </div>
          <h3 className="font-semibold">{item.name}</h3>
          <p className="mt-1 min-h-10 text-sm leading-5 text-slate-500">{item.description}</p></div>
          <button type="button" disabled={Boolean(busy) || installed} onClick={() => void install(item)}
            className={"mt-5 inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-65 " +
              (installed ? "bg-slate-50 dark:bg-slate-800" : "border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800")}>
            {installed ? <Check className="h-4 w-4"/> : <Plus className="h-4 w-4"/>}
            {installed ? "In your library" : busy === item.id ? "Adding…" : "Add to my skills"}
          </button>
        </article>;
      })}
    </div>
    <p className="text-xs text-slate-500">Library entries are instruction templates, not executable plugins. Imported skills start disabled.</p>
  </section>;
}
