"use client";

import { isValidElement, useContext, type ComponentPropsWithoutRef, type ComponentType, type JSX, type ReactElement } from "react";
import type { Components, ExtraProps } from "react-markdown";
import type { ProjectAgentTaskSource } from "@/lib/project-agent/types";
import { normalizePresentationMarkdown } from "@/lib/project-agent/normalize-presentation-markdown";
import { ProjectAgentSourceLink } from "./ProjectAgentSourceLink";
import { ProjectAgentRichBlock } from "./ProjectAgentRichBlocks";
import { ProjectAgentCodeBlock } from "./ProjectAgentCodeBlocks";
import { ProjectAgentTable } from "./ProjectAgentTable";
import { ProjectAgentDocumentCard } from "./ProjectAgentDocumentCard";
import { ProjectAgentFigure, type ImagePresentation } from "./ProjectAgentFigure";
import { isLocalImageSource } from "./projectAgentInlineImages";
import { presentationSourceUrl } from "./presentation-source-utils";
import { createMarkdownPresentationContext, ProjectAgentMarkdownContext, ProjectAgentMarkdownScopeContext,
  presentationSourceKey, type MarkdownPresentationOptions } from "./ProjectAgentMarkdownContext";

export { ProjectAgentMarkdownProvider } from "./ProjectAgentMarkdownContext";
export type { MarkdownPresentationOptions, ProjectAgentMarkdownProviderProps } from "./ProjectAgentMarkdownContext";
export const normalizeProjectAgentMarkdown = normalizePresentationMarkdown;

type TagProps<Tag extends keyof JSX.IntrinsicElements> = ComponentPropsWithoutRef<Tag> & ExtraProps;
type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

function MarkdownHeading({ tag: Tag, node, id, tabIndex, children, ...props }: TagProps<"h1"> & { tag: HeadingTag }) {
  const { options } = useContext(ProjectAgentMarkdownContext);
  const scope = useContext(ProjectAgentMarkdownScopeContext) ?? options.headingIdPrefix;
  const generated = scope && node?.position ? `${scope}-heading-${node.position.start.line}` : undefined;
  const headingId = id === "footnote-label" && scope ? `${scope}-footnote-label` : id ?? generated;
  return <Tag {...props} id={headingId} tabIndex={tabIndex ?? (generated ? -1 : undefined)}>{children}</Tag>;
}

function MarkdownLink({ href, children, node, ...props }: TagProps<"a">) {
  const { options, sources } = useContext(ProjectAgentMarkdownContext);
  const scope = useContext(ProjectAgentMarkdownScopeContext) ?? options.headingIdPrefix;
  if (node?.children.some((child) => child.type === "element" && child.tagName === "img")) return <>{children}</>;
  const describedBy = props["aria-describedby"]?.split(/\s+/).map((id) =>
    id === "footnote-label" && scope ? `${scope}-footnote-label` : id).join(" ");
  const url = href && /^https?:\/\//i.test(href) ? presentationSourceUrl(href) : null;
  if (!url || !href) return <a {...props} href={href && /^https?:\/\//i.test(href) ? undefined : href} aria-describedby={describedBy}>{children}</a>;
  const host = url.hostname.replace(/^www\./, "");
  const label = typeof children === "string" ? children : Array.isArray(children) && children.every((child) => typeof child === "string") ? children.join("") : "";
  const isBareUrl = !label || label === href || /^https?:\/\//i.test(label);
  const metadata = sources.get(presentationSourceKey(href));
  if (options.links === "auto" && !metadata && (!label || (!isBareUrl && !/^\d+$/.test(label)))) {
    return <a {...props} href={href} target="_blank" rel="noopener noreferrer"
      className={`agent-inline-link ${props.className || ""}`}>{children}</a>;
  }
  return <span id={props.id}><ProjectAgentSourceLink href={href} host={host}
    label={isBareUrl || label.length > 28 ? host : label} title={metadata?.title || props.title || (isBareUrl ? host : label)}
    excerpt={metadata?.excerpt} publishedAt={metadata?.publishedAt} /></span>;
}

function MarkdownPre({ children, node, ...preProps }: TagProps<"pre">) {
  const { options } = useContext(ProjectAgentMarkdownContext);
  const code = Array.isArray(children) ? children[0] : children;
  if (isValidElement(code)) {
    const props = (code as ReactElement<{ className?: string; children?: unknown }>).props;
    const classes = typeof props.className === "string" ? props.className.split(/\s+/) : [];
    const text = typeof props.children === "string" ? props.children : String(props.children ?? "");
    if (classes.includes("language-agent-ui")) return <ProjectAgentRichBlock source={text} />;
    if (classes.includes("language-agent-doc")) return <ProjectAgentDocumentCard source={text} onSave={options.onDocumentSave} />;
    if (classes.includes("language-mermaid")) return <ProjectAgentRichBlock source={JSON.stringify({ type: "mermaid", code: text })} />;
    const streaming = Boolean(options.streaming && (options.streamingCodeStartLine === undefined ||
      options.streamingCodeStartLine === node?.position?.start.line));
    return <ProjectAgentCodeBlock language={classes.find((name) => name.startsWith("language-"))?.slice(9) ?? ""}
      code={text} streaming={streaming} onSave={options.onCodeSave} renderPreview={options.renderCodePreview} />;
  }
  return <pre {...preProps}>{children}</pre>;
}

function MarkdownImage({ src, alt }: TagProps<"img">) {
  const { resolveImage, images } = useContext(ProjectAgentMarkdownContext);
  if (typeof src !== "string") return null;
  let url: string | null;
  try { url = resolveImage?.(src) ?? (resolveImage && isLocalImageSource(src) ? null : src); }
  catch { url = null; }
  return <ProjectAgentFigure key={url || src} src={url || ""} alt={alt} presentation={images[src]} />;
}

/** Component identities are deliberately stable across chunks, metadata and callback updates. */
export const projectAgentMarkdownComponents = {
  h1: (props) => <MarkdownHeading {...props} tag="h1" />,
  h2: (props) => <MarkdownHeading {...props} tag="h2" />,
  h3: (props) => <MarkdownHeading {...props} tag="h3" />,
  h4: (props) => <MarkdownHeading {...props} tag="h4" />,
  h5: (props) => <MarkdownHeading {...props} tag="h5" />,
  h6: (props) => <MarkdownHeading {...props} tag="h6" />,
  a: MarkdownLink,
  pre: MarkdownPre,
  code: ({ node: _node, className, children, ...props }) => <code {...props} className={className || "agent-inline-code"}>{children}</code>,
  blockquote: ({ node: _node, className, ...props }) => <blockquote {...props} className={`agent-blockquote ${className || ""}`} />,
  span: ({ node: _node, className, children, ...props }) => className?.split(" ").includes("katex-display")
    ? <span {...props} className={className} role="region" aria-label="Scrollable formula" tabIndex={0}>{children}</span>
    : <span {...props} className={className}>{children}</span>,
  hr: ({ node: _node, ...props }) => <hr {...props} />,
  img: MarkdownImage,
  p: ({ children, node, ...props }) => node?.children.some((child) => child.type === "element" &&
    (child.tagName === "img" || (child.tagName === "a" && child.children.some((nested) => nested.type === "element" && nested.tagName === "img"))))
    ? <div {...props} className={`agent-image-paragraph ${props.className || ""}`}>{children}</div> : <p {...props}>{children}</p>,
  table: ({ children }) => <ProjectAgentTable>{children}</ProjectAgentTable>,
  th: ({ node: _node, style, align, ...props }) => <th {...props} scope="col" style={{ ...style, textAlign: align && align !== "char" ? align : style?.textAlign }} />,
  td: ({ node: _node, style, align, ...props }) => <td {...props} style={{ ...style, textAlign: align && align !== "char" ? align : style?.textAlign }} />,
} satisfies Components;

/** Legacy adapter: memoize this result; new hosts can use the provider and stable map above. */
export function createProjectAgentMarkdownComponents(sources: ProjectAgentTaskSource[] = [],
  resolveImage?: (src: string) => string | null, images: Record<string, ImagePresentation> = {},
  options: MarkdownPresentationOptions = {}): Components {
  const value = createMarkdownPresentationContext({ sources, resolveImage, images, options });
  function scope<Props extends object>(Tag: ComponentType<Props>) {
    return function ScopedMarkdownTag(props: Props) {
      return <ProjectAgentMarkdownContext.Provider value={value}><Tag {...props} /></ProjectAgentMarkdownContext.Provider>;
    };
  }
  // All entries above are React components. The assertion only bridges Object.entries' erased tag-specific props.
  return Object.fromEntries(Object.entries(projectAgentMarkdownComponents).map(([tag, Tag]) =>
    [tag, scope(Tag as ComponentType<Record<string, unknown>>)])) as Components;
}
