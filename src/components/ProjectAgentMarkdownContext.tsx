"use client";

import { createContext, useMemo, type ReactNode } from "react";
import type { ProjectAgentTaskSource } from "@/lib/project-agent/types";
import type { ImagePresentation } from "./ProjectAgentFigure";
import type { WritingDocumentChange } from "./useWritingDraft";
import type { ProjectAgentCodeSaveHandler, ProjectAgentCodePreviewRenderer } from "./project-agent-code-types";

export type MarkdownPresentationOptions = {
  links?: "auto" | "citations";
  headingIdPrefix?: string;
  streaming?: boolean;
  /** null means no open code fence; undefined retains the legacy all-code streaming flag. */
  streamingCodeStartLine?: number | null;
  onDocumentSave?: (change: WritingDocumentChange) => void | Promise<void>;
  onCodeSave?: ProjectAgentCodeSaveHandler;
  renderCodePreview?: ProjectAgentCodePreviewRenderer;
};

export type ProjectAgentMarkdownProviderProps = {
  children: ReactNode;
  sources?: ProjectAgentTaskSource[];
  resolveImage?: (src: string) => string | null;
  images?: Record<string, ImagePresentation>;
  options?: MarkdownPresentationOptions;
};

const EMPTY_SOURCES: ProjectAgentTaskSource[] = [];
const EMPTY_IMAGES: Record<string, ImagePresentation> = {};
const EMPTY_OPTIONS: MarkdownPresentationOptions = {};

export function presentationSourceKey(url: string): string {
  try { const parsed = new URL(url); parsed.hash = ""; return parsed.href; } catch { return url; }
}

export function createMarkdownPresentationContext({ sources = EMPTY_SOURCES, resolveImage,
  images = EMPTY_IMAGES, options = EMPTY_OPTIONS }: Omit<ProjectAgentMarkdownProviderProps, "children">) {
  return { sources: new Map(sources.map((source) => [presentationSourceKey(source.url), source])), resolveImage, images, options };
}

export const ProjectAgentMarkdownContext = createContext(createMarkdownPresentationContext({}));
/** Every Markdown instance gets a separate scope, including expanded writing readers. */
export const ProjectAgentMarkdownScopeContext = createContext<string | undefined>(undefined);

/** Metadata updates change context without replacing the Markdown tag component types. */
export function ProjectAgentMarkdownProvider({ children, sources, resolveImage, images, options }: ProjectAgentMarkdownProviderProps) {
  const value = useMemo(() => createMarkdownPresentationContext({ sources, resolveImage, images, options }),
    [sources, resolveImage, images, options]);
  return <ProjectAgentMarkdownContext.Provider value={value}>{children}</ProjectAgentMarkdownContext.Provider>;
}
