"use client";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

export interface CodeContentProps {
  language?: string;
  code: string;
  wrap?: boolean;
  lineNumbers?: boolean;
}

/** Syntax content only; the outer code card owns all actions and scrolling. */
export default function CodeBlock({ language, code, wrap = false, lineNumbers = false }: CodeContentProps) {
  return <SyntaxHighlighter language={language || "text"} style={oneDark}
    className="agent-code-highlight" PreTag="pre"
    customStyle={{
      margin: 0, padding: "1rem", borderRadius: 0, background: "transparent",
      fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit",
      overflow: "visible", minWidth: wrap ? 0 : "max-content",
    }}
    codeTagProps={{ style: { fontFamily: "inherit", whiteSpace: wrap ? "pre-wrap" : "pre", overflowWrap: wrap ? "anywhere" : undefined } }}
    showLineNumbers={lineNumbers} wrapLines={wrap} wrapLongLines={wrap}
    lineNumberStyle={{ minWidth: "2.5em", paddingRight: "1em", color: "#8b96a8", userSelect: "none", fontSize: "0.9em" }}>
    {code}
  </SyntaxHighlighter>;
}
