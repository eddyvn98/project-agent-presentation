"use client";

import { useEffect, useState } from "react";

type Approval = {
  status: "needs_changes" | "awaiting_approval" | "approved" | "rejected";
  sha256: string;
  review: { blockers: number; warnings: number; issues: { message: string }[] };
  latest?: { reviewer: string; decidedAt: string; decision: string };
};
type Props = { projectId: string; taskId: string; sourceFileId: string };

export function ProjectAgentDesignApproval({ projectId, taskId, sourceFileId }: Props) {
  const [state, setState] = useState<Approval | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState("");
  const [problem, setProblem] = useState("");
  const url = "/api/projects/" + encodeURIComponent(projectId) +
    "/agent/tasks/" + encodeURIComponent(taskId) +
    "/design-approvals/" + encodeURIComponent(sourceFileId);
  useEffect(() => {
    const ctrl = new AbortController();
    setState(null);
    setSavedId("");
    setConfirmed(false);
    setProblem("");
    fetch(url, { credentials: "same-origin", cache: "no-store", signal: ctrl.signal })
      .then(async response => {
        if (!response.ok) throw Error("Approval status unavailable (" + response.status + ")");
        return response.json() as Promise<Approval>;
      }).then(data => { if (!ctrl.signal.aborted) setState(data); })
      .catch(error => { if (!ctrl.signal.aborted) setProblem(String(error)); });
    return () => ctrl.abort();
  }, [url]);
  async function decide(approve: boolean) {
    if (!state || busy || !confirmed || (approve && state.review.blockers)) return;
    setBusy(true);
    setProblem("");
    try {
      const result = await fetch(url, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve, sha256: state.sha256 }),
      });
      const response = await result.json() as { error?: string };
      if (!result.ok) throw Error(response.error || "Approval failed");
      const fresh = await fetch(url, { credentials: "same-origin", cache: "no-store" });
      if (!fresh.ok) throw Error("Decision saved, but refresh failed");
      setState(await fresh.json() as Approval);
      setConfirmed(false);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  async function saveBundle() {
    if (state?.status !== "approved" || busy) return;
    setBusy(true); setProblem("");
    try {
      const route = "/api/projects/" + encodeURIComponent(projectId) +
        "/agent/tasks/" + encodeURIComponent(taskId) + "/files/" +
        encodeURIComponent(sourceFileId) + "/save";
      const response = await fetch(route, { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: "{}" });
      const payload = await response.json() as { error?: string; archiveId?: string };
      if (!response.ok || !payload.archiveId) throw Error(payload.error || "Could not save complete design");
      setSavedId(payload.archiveId);
    } catch (error) { setProblem(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <section aria-label="Human CAD BIM release approval"
    className="border-t border-slate-200 p-3 text-sm dark:border-slate-700">
    <h4 className="font-semibold">Release control · human approval</h4>
    <p className="mt-1 text-xs text-slate-500">
      AI reviews geometry; only the authenticated Project owner can approve saving this exact revision.
      Downloaded concepts are drafts and are not construction-certified.
    </p>
    {!state && !problem && <p role="status">Checking server approval status…</p>}
    {problem && <p role="alert" className="my-2 text-xs text-red-700">{problem}</p>}
    {state && <>
      <p className="mt-2 text-xs" data-testid="design-approval-status">
        {state.status === "approved" ? "Approved for Project release" :
          state.status === "needs_changes" ? "AI detected blockers; repair required" :
          state.status === "rejected" ? "Rejected by reviewer" :
          "AI checked · awaiting human approval"}
        {" · "}{state.review.blockers} blocker(s), {state.review.warnings} warning(s)
      </p>
      {savedId && <p role="status" className="mt-2 text-xs">Saved persistent design: {savedId}</p>}
      {state.latest && <p className="mt-1 text-xs text-slate-500">
        {state.latest.decision} by {state.latest.reviewer} at {state.latest.decidedAt}
      </p>}
      {state.review.issues.slice(0, 4).map((issue, i) =>
        <p key={i} className="mt-1 text-xs">{issue.message}</p>)}
      <label className="mt-3 flex items-start gap-2 rounded-lg border p-3 text-xs">
        <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}
          aria-label="I verified this specific design revision"
          className="mt-0.5 h-5 w-5 shrink-0" />
        I inspected this revision, measurements and warnings. I accept responsibility for
        the release decision. Editing the design requires a new approval.
      </label>
      {state.status === "approved" && <button type="button" onClick={() => void saveBundle()}
        disabled={busy || Boolean(savedId)}
        className="mt-2 min-h-11 w-full rounded-lg border border-sky-600 px-3 font-semibold disabled:opacity-40">
        {savedId ? "Saved in Project" : "Save approved CAD/BIM bundle to Project"}
      </button>}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" disabled={!confirmed || busy} onClick={() => void decide(false)}
          className="min-h-11 rounded-lg border px-3 disabled:opacity-40">Reject revision</button>
        <button type="button" disabled={!confirmed || busy || state.review.blockers > 0}
          onClick={() => void decide(true)}
          className="min-h-11 rounded-lg bg-slate-900 px-3 text-white disabled:opacity-40">
          Approve release
        </button>
      </div>
    </>}
  </section>;
}
