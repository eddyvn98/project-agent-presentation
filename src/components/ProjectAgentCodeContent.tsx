"use client";

import { Component, lazy, Suspense, type ReactNode } from "react";
import type { CodeContentProps } from "@/lib/markdown/CodeBlock.client";

const HighlightedCode = lazy(() => import("@/lib/markdown/CodeBlock.client"));

function PlainCode({ code, wrap, lineNumbers }: CodeContentProps) {
  const lines = lineNumbers ? code.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? [""] : [];
  // Keep each original line ending, without numbering the artificial empty split at EOF.
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return <pre className="agent-code-plain" style={{ whiteSpace: wrap ? "pre-wrap" : "pre" }}><code>
    {lineNumbers ? lines.map((line, index) => <span className="agent-code-plain-line" key={index}>
      <span className="agent-code-line-number" aria-hidden="true">{index + 1}</span>{line}
    </span>) : code}
  </code></pre>;
}

class HighlightBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function ProjectAgentCodeContent({ plain, ...props }: CodeContentProps & { plain: boolean }) {
  const fallback = <PlainCode {...props} />;
  // Very large snippets remain readable without an expensive tokenization pass.
  if (plain || props.code.length > 80_000) return fallback;
  return <HighlightBoundary fallback={fallback}>
    <Suspense fallback={fallback}><HighlightedCode {...props} /></Suspense>
  </HighlightBoundary>;
}
