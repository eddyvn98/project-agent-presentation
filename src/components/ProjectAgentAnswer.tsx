"use client";

import { useContext, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { ProjectAgentTaskSource } from "@/lib/project-agent/types";
import { splitPresentationSections } from "@/lib/project-agent/presentation-mode";
import { prepareStreamingPresentation, type StreamingPresentation } from "@/lib/project-agent/streaming-presentation";
import { getAnswerOutline } from "@/lib/project-agent/answer-outline";
import { ProjectAgentMarkdownProvider, projectAgentMarkdownComponents, normalizeProjectAgentMarkdown, type MarkdownPresentationOptions } from "./ProjectAgentMarkdown";
import type { ImagePresentation } from "./ProjectAgentFigure";
import { ProjectAgentAnswerActions, type AnswerActionHandlers } from "./ProjectAgentAnswerActions";
import { ProjectAgentAnswerOutline } from "./ProjectAgentAnswerOutline";
import { ProjectAgentMarkdownBody } from "./ProjectAgentMarkdownBody";
import { ProjectAgentPresentationControls } from "./ProjectAgentPresentationControls";
import { ProjectAgentResponseContext } from "./ProjectAgentResponseContext";
import { ProjectAgentResponseStatus, type ResponseState } from "./ProjectAgentResponseStatus";
import { ProjectAgentSelectionAction, type AnswerQuote } from "./ProjectAgentSelectionAction";
import { ProjectAgentSources } from "./ProjectAgentSources";
import "./presentation.css";

const EMPTY_SOURCES: ProjectAgentTaskSource[] = [];
const EMPTY_IMAGES: Record<string, ImagePresentation> = {};

export interface ProjectAgentAnswerProps {
  markdown: string;
  sources?: ProjectAgentTaskSource[];
  resolveImage?: (src: string) => string | null;
  images?: Record<string, ImagePresentation>;
  /** Show an optional, user-controlled slide presentation for long answers. */
  presentation?: boolean;
  /** Show ordinary code as it arrives; wait for complete structured visual payloads. */
  streaming?: boolean;
  id?: string;
  className?: string;
  status?: ResponseState;
  statusDetail?: string;
  actions?: boolean | AnswerActionHandlers;
  showSources?: boolean;
  outline?: boolean;
  /** Auto preserves ordinary descriptive links and treats supplied sources as citations. */
  links?: "auto" | "citations";
  onQuote?: (quote: AnswerQuote) => void | Promise<void>;
  onDocumentSave?: MarkdownPresentationOptions["onDocumentSave"];
  onCodeSave?: MarkdownPresentationOptions["onCodeSave"];
  renderCodePreview?: MarkdownPresentationOptions["renderCodePreview"];
}

export function ProjectAgentAnswer(props: ProjectAgentAnswerProps) {
  const scope = useContext(ProjectAgentResponseContext);
  return <AnswerContent key={props.id ?? scope ?? "answer"} {...props} />;
}

function AnswerContent({
  markdown, sources = EMPTY_SOURCES, resolveImage, images = EMPTY_IMAGES,
  presentation = false, streaming = false, id, className = "", status, statusDetail,
  actions = false, showSources = false, outline = false, links = "auto", onQuote, onDocumentSave, onCodeSave, renderCodePreview,
}: ProjectAgentAnswerProps) {
  const generatedId = useId();
  const inheritedScope = useContext(ProjectAgentResponseContext);
  const prefix = id || `answer-${generatedId.replace(/[^a-z\d_-]/gi, "")}`;
  const [presenting, setPresenting] = useState(false);
  const [slide, setSlide] = useState(0);
  const deckRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const state = status ?? (streaming ? "streaming" : "complete");
  const active = state === "streaming";
  const stream = useMemo<StreamingPresentation>(() => state !== "complete" ? prepareStreamingPresentation(markdown) :
    { text: markdown, pending: null }, [markdown, state]);
  const normalized = useMemo(() => normalizeProjectAgentMarkdown(stream.text), [stream.text]);
  // Prose repairs can insert lines; match the open fence against the Markdown actually rendered.
  const codeStartLine = useMemo(() => active && stream.pending === "code"
    ? prepareStreamingPresentation(normalized).codeStartLine ?? null : null, [active, stream.pending, normalized]);
  const sections = useMemo(() => splitPresentationSections(normalized), [normalized]);
  const canPresent = presentation && sections.length > 1 && state === "complete";
  const inDeck = presenting && canPresent;
  const index = Math.max(0, Math.min(slide, sections.length - 1));
  const visible = inDeck ? sections[index] : normalized;
  const headings = useMemo(() => getAnswerOutline(normalized, prefix), [normalized, prefix]);
  const options = useMemo<MarkdownPresentationOptions>(() => ({
    headingIdPrefix: prefix, links, streaming: active, streamingCodeStartLine: codeStartLine,
    onDocumentSave, onCodeSave, renderCodePreview,
  }), [prefix, links, active, codeStartLine, onDocumentSave, onCodeSave, renderCodePreview]);
  useEffect(() => { if (!canPresent) setPresenting(false); }, [canPresent]);
  const move = (next: number) => {
    setSlide(Math.max(0, Math.min(sections.length - 1, next)));
    slideRef.current?.scrollTo?.({ top: 0, behavior: "auto" });
  };
  const exitFullscreen = () => {
    if (document.fullscreenElement === deckRef.current) return document.exitFullscreen().catch(() => {});
    return Promise.resolve();
  };
  const onKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!inDeck || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, select, textarea, [role=slider], [role=dialog], pre, [role=region], [contenteditable=true]")) return;
    if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); move(index + 1); }
    else if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); move(index - 1); }
    else if (event.key === "Escape") setPresenting(false);
  };
  const detail = statusDetail || (active && stream.pending === "visual" ? "Preparing visual…" :
    active && stream.pending === "writing" ? "Writing document…" : undefined);
  return <ProjectAgentResponseContext.Provider value={id ?? inheritedScope}>
    <div ref={deckRef} id={prefix} className={`agent-answer ${inDeck ? "agent-deck" : ""} ${className}`}
      data-state={state} onKeyDown={onKeys} tabIndex={inDeck ? 0 : undefined}>
      {canPresent && <ProjectAgentPresentationControls presenting={inDeck} index={index}
        count={sections.length} markdown={markdown} onToggle={() => {
          if (inDeck) void exitFullscreen();
          setPresenting(!inDeck); setSlide(0);
        }}
        onMove={move} onFullscreen={async () => {
          if (!deckRef.current?.requestFullscreen) throw new Error("Fullscreen unsupported");
          await deckRef.current.requestFullscreen();
        }} onPrint={() => {
          setPresenting(false);
          void exitFullscreen().then(() => requestAnimationFrame(() => requestAnimationFrame(() => window.print())));
        }} />}
      {outline && !inDeck && <ProjectAgentAnswerOutline headings={headings} />}
      <ProjectAgentMarkdownProvider sources={sources} resolveImage={resolveImage} images={images} options={options}>
        <ProjectAgentSelectionAction onQuote={active ? undefined : onQuote}>
          <div ref={slideRef} className={`agent-answer-body${inDeck ? " agent-slide" : ""}`} dir="auto">
            <ProjectAgentMarkdownBody markdown={visible} components={projectAgentMarkdownComponents} idPrefix={prefix} />
          </div>
        </ProjectAgentSelectionAction>
      </ProjectAgentMarkdownProvider>
      <ProjectAgentResponseStatus state={state} detail={detail} empty={!stream.text.trim()} />
      {showSources && sources.length > 0 && !active && <ProjectAgentSources sources={sources} />}
      {actions && <ProjectAgentAnswerActions markdown={markdown} disabled={active}
        handlers={typeof actions === "object" ? actions : undefined} />}
    </div>
  </ProjectAgentResponseContext.Provider>;
}
