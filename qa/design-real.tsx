import { useCallback, useEffect, useMemo, useState } from "react";
import { ProjectAgentDesignHandoff } from "../components/features/projects/ProjectAgentDesignHandoff";
import { collectDesignHandoffs } from "../lib/project-agent/design-handoff";
import type { ProjectAgentTaskFile } from "../lib/project-agent/types";

const prefix = "/api/qa/design-real";
type Inventory = { original: string; files: ProjectAgentTaskFile[] };
type Revision = { id: string; source: string; files: string[] };

function extractTypedEdit(text: string): unknown {
  const start = text.indexOf('{"action":"design_edit"');
  const end = text.indexOf(". Validate dimensions", start);
  if (start < 0 || end <= start) throw Error("A valid typed design change is required.");
  return JSON.parse(text.slice(start, end)) as unknown;
}

export function DesignRealQA() {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [draft, setDraft] = useState("");
  const [chosenFile, setChosenFile] = useState<ProjectAgentTaskFile | null>(null);
  const [result, setResult] = useState<Revision | null>(null);
  const [problem, setProblem] = useState("");
  const [sending, setSending] = useState(false);
  const load = useCallback(async () => {
    const res = await fetch(prefix + "/models", { cache: "no-store" });
    if (!res.ok) throw Error("Could not fetch real exported files.");
    setInventory(await res.json() as Inventory);
  }, []);
  useEffect(() => { void load().catch(err => setProblem(String(err))); }, [load]);
  const { handoffs } = useMemo(() => collectDesignHandoffs(inventory?.files ?? []), [inventory]);
  const href = (file: ProjectAgentTaskFile) => file.name.endsWith(".design.json")
    ? "/api/projects/qa/agent/tasks/qa/files/" + file.name
    : prefix + "/files/" + file.name;
  async function submit() {
    try {
      setSending(true);
      setProblem("");
      const typed = extractTypedEdit(draft);
      const response = await fetch(prefix + "/revise", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(typed),
      });
      const body = await response.json() as Revision & { error?: string };
      if (!response.ok) throw Error(body.error || "Revision rejected");
      setResult(body);
      setChosenFile(null);
      setDraft("");
      await load();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }
  return <section className="mx-auto max-w-3xl space-y-4" aria-label="Real CAD BIM user journey QA">
    <header><h1 className="text-xl font-semibold">Real CAD/BIM export → edit → export</h1>
      <p className="text-sm text-slate-500">Real Python exporter, binary files and typed revisions. No mocked responses.</p></header>
    {problem && <div role="alert" className="rounded-lg border border-red-500 p-3 text-sm">{problem}</div>}
    {!inventory && <p role="status">Generating authentic PDF / DXF / GLB / PNG / HTML...</p>}
    {handoffs.map(design => <ProjectAgentDesignHandoff key={design.id} design={design}
      fileHref={href} onPreview={setChosenFile} onEdit={setDraft} />)}
    {chosenFile && <section aria-label="Real file preview" className="rounded-lg border p-2">
      <div className="mb-2 text-sm font-semibold">Preview: {chosenFile.name}</div>
      {chosenFile.name.endsWith(".web.html") ?
        <iframe title="Real 3D concept preview" data-testid="real-3d-iframe"
          sandbox="allow-scripts" src={href(chosenFile)}
          className="h-[min(68dvh,640px)] min-h-[340px] w-full border" /> :
        <iframe title="Real exported document" src={href(chosenFile)}
          className="h-[min(68dvh,640px)] min-h-[340px] w-full border" />}
      <button type="button" onClick={() => setChosenFile(null)}
        className="mt-2 min-h-11 rounded-lg border px-4">Close preview</button>
    </section>}
    <section className="rounded-xl border p-3" aria-label="Explicit revision submit">
      <label className="mb-2 block text-sm font-medium" htmlFor="real-design-draft">Design edit request</label>
      <textarea id="real-design-draft" aria-label="Design change draft" value={draft}
        onChange={event => setDraft(event.target.value)}
        className="min-h-[130px] w-full rounded-lg border p-3 text-sm" />
      <button type="button" disabled={!draft || sending} onClick={() => void submit()}
        className="mt-2 min-h-11 rounded-lg bg-slate-900 px-4 text-white disabled:opacity-40">
        {sending ? "Exporting revision..." : "Submit revision and export"}
      </button>
    </section>
    {result && <p role="status" data-testid="real-revision-result">
      Exported {result.id} from {result.source}; the original files remain available.
    </p>}
    <p className="text-xs text-slate-500">This isolated QA server does not have host authentication or real Dify.
      The production host must separately verify owner permissions and task persistence.</p>
  </section>;
}
