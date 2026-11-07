"use client";

import { useEffect, useState } from "react";

type Version = {
  id: string; sourceName: string; sourceSha256: string; createdAt: string;
  approvedBy: string; files: { name: string; size: number; sha256: string }[];
};
type Props = { projectId: string; onEdit?: (prompt: string) => void };

export function ProjectAgentDesignArchiveLibrary({ projectId, onEdit }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const url = "/api/projects/" + encodeURIComponent(projectId) + "/agent/design-archives";
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal, credentials: "same-origin", cache: "no-store" })
      .then(async result => {
        if (!result.ok) throw new Error("Saved CAD/BIM versions unavailable (" + result.status + ")");
        return result.json() as Promise<{ versions: Version[] }>;
      }).then(result => {
        if (!controller.signal.aborted) setVersions(result.versions);
      }).catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Archive unavailable");
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url]);
  if (!loading && !versions.length && !error) return null;
  return <section aria-label="Saved CAD BIM design versions"
    className="my-3 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
    <h3 className="font-semibold">Saved CAD/BIM versions</h3>
    <p className="mt-1 text-xs text-slate-500">
      Approved concepts persist independently of the original chat and its temporary workspace.
    </p>
    {loading && <p role="status" className="mt-2 text-xs">Loading saved designs…</p>}
    {error && <p role="alert" className="mt-2 text-xs text-amber-700">{error}</p>}
    {versions.map(version => {
      const prefix = url + "/" + encodeURIComponent(version.id) + "/files/";
      return <div key={version.id} className="mt-3 rounded-lg border p-3 dark:border-slate-700">
        <p className="text-xs font-medium">{version.sourceName}</p>
        <p className="mt-1 text-xs text-slate-500">Approved by {version.approvedBy} · {version.createdAt}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {version.files.filter(file => /\.(pdf|glb|dxf|ifc|design\.json)$/.test(file.name)).map(file =>
            <a key={file.name} href={prefix + encodeURIComponent(file.name)}
              download={file.name} className="inline-flex min-h-11 items-center rounded-lg border px-3 text-xs">
              {file.name.split(".").slice(1).join(".").toUpperCase()}
            </a>)}
        </div>
        {onEdit && <button type="button" className="mt-2 min-h-11 rounded-lg border border-sky-600 px-3"
          onClick={() => onEdit(
            "Continue editing the SAVED CAD/BIM Project design using design_edit. " +
            "Source: \"archive:" + version.id + "\". The source is approved and immutable; " +
            "create a NEW unapproved revision for human review. Requested changes: "
          )}>
          Ask AI to revise this saved version
        </button>}
      </div>;
    })}
  </section>;
}
