"use client";
import { useEffect, useState } from "react";
import type { SkillCatalogEntry } from "@/lib/project-agent/skill-catalog";
export function AgentSkillCatalog() {
  const [skills, setSkills] = useState<Array<Omit<SkillCatalogEntry, "instructions">>>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let ready = true;
    void fetch("/api/project-agent/skill-catalog", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((data: { catalog?: Array<Omit<SkillCatalogEntry,"instructions">> } | null) => {
        if (ready) setSkills(data?.catalog ?? []);
      }).catch(() => {});
    return () => { ready = false; };
  }, []);
  async function install(id: string) {
    setBusy(id); setMessage("");
    try {
      const r = await fetch("/api/project-agent/skill-catalog", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      });
      if (!r.ok) throw new Error("Could not add this skill");
      setMessage("Added disabled. Review and enable it in Personal Skill Registry when ready.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Skill unavailable"); }
    finally { setBusy(""); }
  }
  return <section aria-label="Agent curated skill catalog" className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">Curated skill catalog</h2>
    <p className="text-sm text-slate-500">Advisory text templates, not executable plugins. Imported skills are disabled until you review and enable them.</p>
    {message && <p role="status" className="text-xs text-slate-600">{message}</p>}
    <div className="grid gap-2 sm:grid-cols-2">
      {skills.map(item => <div key={item.id} className="space-y-1 rounded-lg border p-3">
        <strong className="text-sm">{item.name}</strong>
        <p className="text-xs text-slate-500">{item.category} · {item.description}</p>
        <button type="button" disabled={Boolean(busy)}
          onClick={() => void install(item.id)} className="rounded border px-2 py-1 text-xs">
          {busy === item.id ? "Adding…" : "Add disabled skill"}
        </button>
      </div>)}
    </div>
  </section>;
}
