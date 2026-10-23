"use client";

import { AlertCircle, Loader2, Square } from "lucide-react";

export type ResponseState = "complete" | "streaming" | "stopped" | "error";

/** The host supplies status; the renderer never infers hidden model activity. */
export function ProjectAgentResponseStatus({ state, detail, empty, onRetry }: {
  state: ResponseState; detail?: string; empty?: boolean; onRetry?: () => void;
}) {
  if (state === "complete") return null;
  const label = detail || (state === "streaming" ? "Writing response…" :
    state === "stopped" ? "Response stopped" : "This response could not be completed.");
  return <div className={`agent-response-status agent-response-status--${state} not-prose`}
    role={state === "error" ? "alert" : "status"} aria-atomic="true">
    {state === "streaming" ? <Loader2 aria-hidden className="agent-status-spinner" /> :
      state === "error" ? <AlertCircle aria-hidden /> : <Square aria-hidden />}
    <span>{label}</span>
    {empty && state === "streaming" && <span className="agent-response-skeleton" aria-hidden />}
    {onRetry && state === "error" && <button type="button" className="agent-text-button" onClick={onRetry}>Try again</button>}
  </div>;
}
