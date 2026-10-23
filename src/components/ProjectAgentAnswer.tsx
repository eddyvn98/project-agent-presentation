"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { ProjectAgentTaskSource } from "@/lib/project-agent/types";
import { createProjectAgentMarkdownComponents, normalizeProjectAgentMarkdown } from "./ProjectAgentMarkdown";
import type { ImagePresentation } from "./ProjectAgentFigure";
import "katex/dist/katex.min.css";
import "./presentation.css";

/** Optional entry point; existing component maps and file/source adapters remain supported. */
export function ProjectAgentAnswer({ markdown, sources = [], resolveImage, images = {} }: {
  markdown: string;
  sources?: ProjectAgentTaskSource[];
  resolveImage?: (src: string) => string | null;
  images?: Record<string, ImagePresentation>;
}) {
  return <div className="agent-answer">
    <ReactMarkdown skipHtml remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { throwOnError: false, trust: false, strict: "error", maxExpand: 200, maxSize: 20 }]]}
      components={createProjectAgentMarkdownComponents(sources, resolveImage, images)}>
      {normalizeProjectAgentMarkdown(markdown)}
    </ReactMarkdown>
  </div>;
}
