"use client";

import { Component, useEffect, useId, useState, type ComponentProps, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { containsMathMarkdown } from "@/lib/project-agent/math-detection";
import { ProjectAgentMarkdownScopeContext } from "./ProjectAgentMarkdownContext";

type Plugins = Pick<ComponentProps<typeof ReactMarkdown>, "remarkPlugins" | "rehypePlugins">;
const PROSE_PLUGINS: Plugins = { remarkPlugins: [remarkGfm] };
let loadedMath: Plugins | undefined;
let loadingMath: Promise<Plugins> | undefined;

function loadMathPlugins() {
  if (!loadingMath) loadingMath = import("./ProjectAgentMathMarkdown").then((module) => {
    loadedMath = module.mathMarkdownPlugins;
    return loadedMath;
  }).catch((error: unknown) => { loadingMath = undefined; throw error; });
  return loadingMath;
}

class MarkdownBoundary extends Component<{ children: ReactNode; fallback: ReactNode; markdown: string }, { failed: boolean; markdown: string }> {
  state = { failed: false, markdown: this.props.markdown };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps(props: { markdown: string }, state: { markdown: string }) {
    return props.markdown !== state.markdown ? { failed: false, markdown: props.markdown } : null;
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Load optional math plugins without swapping out the renderer or its existing rich controls. */
export function ProjectAgentMarkdownBody({ markdown, components, idPrefix }: {
  markdown: string; components: Components; idPrefix?: string;
}) {
  const generatedId = useId();
  const scope = idPrefix ?? `markdown-${generatedId.replace(/[^a-z\d_-]/gi, "")}`;
  const needsMath = containsMathMarkdown(markdown);
  const [plugins, setPlugins] = useState<Plugins | undefined>(loadedMath);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!needsMath || plugins) return;
    let current = true;
    setFailed(false);
    void loadMathPlugins().then((value) => { if (current) setPlugins(value); }, () => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [needsMath, plugins, retry]);
  const rehypeOptions = { clobberPrefix: `${scope}-content-` };
  const fallback = <><ReactMarkdown skipHtml {...PROSE_PLUGINS} components={components}
    remarkRehypeOptions={rehypeOptions}>{markdown}</ReactMarkdown>
    <p className="agent-layout-note" role="status">Math formatting is unavailable. The original notation is shown.</p></>;
  return <ProjectAgentMarkdownScopeContext.Provider value={scope}>
    <MarkdownBoundary markdown={markdown} fallback={fallback}>
      <ReactMarkdown skipHtml {...(plugins ?? PROSE_PLUGINS)} components={components}
        remarkRehypeOptions={rehypeOptions}>{markdown}</ReactMarkdown>
    </MarkdownBoundary>
    {needsMath && !plugins && <p className="agent-layout-note" role="status">
      {failed ? <>Math formatting is unavailable. The original notation is shown. <button type="button"
        className="agent-text-button" onClick={() => setRetry((value) => value + 1)}>Retry math formatting</button></>
        : "Finishing math layout…"}
    </p>}
  </ProjectAgentMarkdownScopeContext.Provider>;
}
