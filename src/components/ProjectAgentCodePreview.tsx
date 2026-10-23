"use client";

import { Component, Suspense, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Code2, Eye } from "lucide-react";
import type { ProjectAgentCodePreviewInput, ProjectAgentCodePreviewRenderer } from "./project-agent-code-types";

export type ProjectAgentCodeView = "code" | "preview";

export function ProjectAgentCodeViewTabs({ id, view, onChange, disabled = false }: {
  id: string; view: ProjectAgentCodeView; onChange: (view: ProjectAgentCodeView) => void; disabled?: boolean;
}) {
  const codeRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLButtonElement>(null);
  const onKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.altKey || event.ctrlKey || event.metaKey || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "code" : event.key === "End" ? "preview" : view === "code" ? "preview" : "code";
    onChange(next);
    (next === "code" ? codeRef : previewRef).current?.focus();
  };
  return <div role="tablist" aria-label="Code block view" className="agent-code-view-tabs" onKeyDown={onKeys}>
    <button ref={codeRef} id={`${id}-code-tab`} type="button" role="tab" aria-selected={view === "code"}
      aria-controls={`${id}-panel`} tabIndex={view === "code" ? 0 : -1} onClick={() => onChange("code")}>
      <Code2 aria-hidden="true" size={15} />Code
    </button>
    <button ref={previewRef} id={`${id}-preview-tab`} type="button" role="tab" aria-selected={view === "preview"}
      aria-controls={`${id}-panel`} tabIndex={view === "preview" ? 0 : -1} disabled={disabled} onClick={() => onChange("preview")}>
      <Eye aria-hidden="true" size={15} />Preview
    </button>
  </div>;
}

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p role="status" className="agent-code-preview-error">Preview is unavailable. Switch to Code to read or copy the source.</p> : this.props.children;
  }
}

function HostPreview({ render, input }: { render: ProjectAgentCodePreviewRenderer; input: ProjectAgentCodePreviewInput }) {
  const content = render(input);
  return content === null || content === undefined || typeof content === "boolean"
    ? <p role="status" className="agent-code-preview-error">No preview is available for this code.</p> : <>{content}</>;
}

export function ProjectAgentCodePreview({ code, language, render }: ProjectAgentCodePreviewInput & { render: ProjectAgentCodePreviewRenderer }) {
  return <div className="agent-code-preview">
    <PreviewBoundary key={JSON.stringify([language, code])}>
      <Suspense fallback={<p role="status" className="agent-code-preview-error">Preparing preview…</p>}>
        <HostPreview render={render} input={{ code, language }} />
      </Suspense>
    </PreviewBoundary>
  </div>;
}
