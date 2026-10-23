"use client";

import { Check, Circle, CircleAlert, Loader2 } from "lucide-react";
import "./conversation-presentation.css";

export type PresentationProgressStep = {
  id: string;
  label: string;
  state: "pending" | "active" | "complete" | "error";
  detail?: string;
};

/** Display host-supplied tool/activity summaries, never invented progress or hidden reasoning. */
export function ProjectAgentProgress({ steps, label, defaultOpen = false }: {
  steps: PresentationProgressStep[]; label?: string; defaultOpen?: boolean;
}) {
  if (!steps.length) return null;
  const current = steps.find((step) => step.state === "active");
  const failed = steps.some((step) => step.state === "error");
  const done = steps.every((step) => step.state === "complete");
  const summary = label || current?.label || (failed ? "Activity needs attention" : done ? "Completed activity" : "Activity");
  return <details className="agent-progress not-prose" open={defaultOpen || undefined}>
    <summary>{current ? <Loader2 aria-hidden className="agent-status-spinner" /> :
      failed ? <CircleAlert aria-hidden /> : done ? <Check aria-hidden /> : <Circle aria-hidden />}
      <span>{summary}</span><span className="agent-progress-count">{steps.filter((step) => step.state === "complete").length}/{steps.length}</span>
    </summary>
    <ol aria-label="Response activity">{steps.map((step) => <li key={step.id} data-state={step.state}>
      <span className="agent-progress-marker" aria-label={step.state}>{step.state === "active" ? <Loader2 aria-hidden className="agent-status-spinner" /> :
        step.state === "complete" ? <Check aria-hidden /> : step.state === "error" ? <CircleAlert aria-hidden /> : <Circle aria-hidden />}</span>
      <div><span>{step.label}</span>{step.detail && <p>{step.detail}</p>}</div>
    </li>)}</ol>
  </details>;
}
