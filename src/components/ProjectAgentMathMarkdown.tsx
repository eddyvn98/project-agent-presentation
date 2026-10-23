"use client";

import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

const KATEX_OPTIONS = {
  throwOnError: false, trust: false, strict: "error", maxExpand: 200, maxSize: 20,
} as const;

export const mathMarkdownPlugins: Pick<ComponentProps<typeof ReactMarkdown>, "remarkPlugins" | "rehypePlugins"> = {
  remarkPlugins: [remarkGfm, remarkMath],
  rehypePlugins: [[rehypeKatex, KATEX_OPTIONS]],
};

/** Dynamically imported only when visible Markdown contains TeX delimiters. */
export default function ProjectAgentMathMarkdown({ markdown, components }: {
  markdown: string;
  components: Components;
}) {
  return <ReactMarkdown skipHtml {...mathMarkdownPlugins} components={components}>{markdown}</ReactMarkdown>;
}
