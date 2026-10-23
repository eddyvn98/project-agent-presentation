"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Globe2 } from "lucide-react";
import type { ProjectAgentTaskSource } from "@/lib/project-agent/types";
import { presentationSourceDate, presentationSourceUrl, uniquePresentationSources } from "./presentation-source-utils";
import "./presentation-visuals.css";

export interface ProjectAgentSourcesProps {
  sources: ProjectAgentTaskSource[];
  /** Expanded on first render only. The reader controls subsequent expansion. */
  defaultOpen?: boolean;
  label?: string;
}

/** A compact source list made solely from metadata supplied by the host. */
export function ProjectAgentSources({ sources, defaultOpen = false, label = "Sources" }: ProjectAgentSourcesProps) {
  const [open, setOpen] = useState(defaultOpen);
  const items = useMemo(() => uniquePresentationSources(sources), [sources]);
  if (!items.length) return null;
  return <details className="agent-sources not-prose" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="agent-sources-summary">
      <Globe2 aria-hidden className="h-4 w-4" />
      <span>{label}</span><span className="agent-sources-count">{items.length}</span>
      <ChevronDown aria-hidden className="agent-sources-chevron h-4 w-4" />
    </summary>
    <ol className="agent-sources-list">
      {items.map((source, index) => {
        const url = presentationSourceUrl(source.url)!;
        const host = url.hostname.replace(/^www\./, "");
        const date = presentationSourceDate(source.publishedAt);
        return <li key={source.url} className="agent-source-row">
          <span aria-hidden className="agent-source-number">{index + 1}</span>
          <div className="agent-source-body">
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="agent-source-title">
              <span>{source.title?.trim() || host}</span><ExternalLink aria-hidden className="h-3.5 w-3.5" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <p className="agent-source-meta">{host}{date && <> · <time dateTime={date}>{date}</time></>}</p>
            {source.excerpt && <p className="agent-source-excerpt" tabIndex={0} aria-label={`Excerpt from ${source.title || host}`}>{source.excerpt}</p>}
          </div>
        </li>;
      })}
    </ol>
  </details>;
}
