"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { ProjectAgentTaskSource } from "@/lib/project-agent/types";
import { completedStreamingMarkdown, splitPresentationSections } from "@/lib/project-agent/presentation-mode";
import { createProjectAgentMarkdownComponents, normalizeProjectAgentMarkdown } from "./ProjectAgentMarkdown";
import type { ImagePresentation } from "./ProjectAgentFigure";
import "katex/dist/katex.min.css";
import "./presentation.css";

export interface ProjectAgentAnswerProps {
  markdown: string;
  sources?: ProjectAgentTaskSource[];
  resolveImage?: (src: string) => string | null;
  images?: Record<string, ImagePresentation>;
  /** Show an optional, user-controlled slide presentation for long answers. */
  presentation?: boolean;
  /** Hide incomplete fenced blocks until a streaming response finishes them. */
  streaming?: boolean;
}
export function ProjectAgentAnswer({
  markdown, sources = [], resolveImage, images = {}, presentation = false, streaming = false,
}: ProjectAgentAnswerProps) {
  const [presenting, setPresenting] = useState(false);
  const [slide, setSlide] = useState(0);
  const [copied, setCopied] = useState(false);
  const deckRef = useRef<HTMLDivElement>(null);
  const stream = useMemo(() => streaming ? completedStreamingMarkdown(markdown) :
    { text: markdown, pending: false }, [markdown, streaming]);
  const normalized = useMemo(() => normalizeProjectAgentMarkdown(stream.text), [stream.text]);
  const sections = useMemo(() => splitPresentationSections(normalized), [normalized]);
  const canPresent = presentation && sections.length > 1;
  const index = Math.min(slide, sections.length - 1);
  const visible = presenting && canPresent ? sections[index] : normalized;
  const components = useMemo(() => createProjectAgentMarkdownComponents(sources, resolveImage, images),
    [sources, resolveImage, images]);
  const move = (next: number) => setSlide(Math.max(0, Math.min(sections.length - 1, next)));
  const onKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!presenting || !canPresent || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, select, textarea, [role=slider]")) return;
    if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault(); move(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault(); move(index - 1);
    } else if (event.key === "Escape") {
      setPresenting(false);
    }
  };
  return <div ref={deckRef} className={`agent-answer ${presenting && canPresent ? "agent-deck" : ""}`}
    onKeyDown={onKeys} tabIndex={presenting && canPresent ? 0 : undefined}>
    {canPresent && <nav className="agent-deck-controls not-prose mb-4 flex flex-wrap items-center gap-2"
      aria-label="Answer presentation controls">
      <button type="button" aria-pressed={presenting} onClick={() => { setPresenting((value) => !value); setSlide(0); }}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium dark:border-slate-600">
        {presenting ? "Read full answer" : "Present as slides"}
      </button>
      {presenting && <>
        <button type="button" className="rounded-lg border px-3 py-2 text-sm" disabled={index === 0} onClick={() => move(index - 1)} aria-label="Previous slide">Previous</button>
        <output aria-live="polite" className="text-sm tabular-nums">{index + 1} / {sections.length}</output>
        <button type="button" className="rounded-lg border px-3 py-2 text-sm" disabled={index === sections.length - 1} onClick={() => move(index + 1)} aria-label="Next slide">Next</button>
        <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => {
          if (deckRef.current?.requestFullscreen) void deckRef.current.requestFullscreen().catch(() => {});
        }}>Fullscreen</button>
      </>}
      <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={async () => {
        try { await navigator.clipboard.writeText(markdown); setCopied(true); }
        catch { setCopied(false); }
      }}>Copy Markdown</button>
      {copied && <span role="status" className="text-xs text-slate-500">Markdown copied</span>}
      <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => {
        setPresenting(false);
        requestAnimationFrame(() => window.print());
      }}>Print / save PDF</button>
    </nav>}
    <div className={presenting && canPresent ? "agent-slide" : undefined}>
      <ReactMarkdown skipHtml remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, trust: false, strict: "error", maxExpand: 200, maxSize: 20 }]]}
        components={components}>{visible}</ReactMarkdown>
    </div>
    {stream.pending && <p role="status" className="not-prose mt-3 text-xs text-slate-500">Preparing visual…</p>}
  </div>;
}
