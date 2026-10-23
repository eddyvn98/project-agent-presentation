"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

const KATEX_OPTIONS = {
  throwOnError: false, trust: false, strict: "error", maxExpand: 200, maxSize: 20,
};

/** Dynamically imported only when visible Markdown contains TeX delimiters. */
export default function ProjectAgentMathMarkdown({ markdown, components }: {
  markdown: string;
  components: Components;
}) {
  return <ReactMarkdown skipHtml remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[[rehypeKatex, KATEX_OPTIONS]]}
    components={components}>{markdown}</ReactMarkdown>;
}
