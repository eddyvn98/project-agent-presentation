"use client";

import { isValidElement, type ReactElement } from "react";
import type { Components } from "react-markdown";
import { ProjectAgentSourceLink } from "./ProjectAgentSourceLink";
import { ProjectAgentRichBlock } from "./ProjectAgentRichBlocks";
import { repairOngUiFences } from "@/lib/project-agent/rich-ui";
import { ProjectAgentCodeBlock } from "./ProjectAgentCodeBlocks";
import { ProjectAgentDocumentCard } from "./ProjectAgentDocumentCard";
import type { ProjectAgentTaskSource } from "@/lib/project-agent/types";
import { ProjectAgentFigure, type ImagePresentation } from "./ProjectAgentFigure";
import { isLocalImageSource } from "./projectAgentInlineImages";

const malformedProjectFileLink = /\[([^\]\n]+)\]\(\s*<a\s+href=(["'])(\/api\/projects\/[^"'<>\s]+)\2[^>]*>[\s\S]*?<\/a>\s*\)/gi;

export function normalizeProjectAgentMarkdown(markdown: string): string {
	return repairOngUiFences(markdown).replace(malformedProjectFileLink, (_match, label: string, _quote: string, href: string) => `[${label}](${href})`);
}

function externalHost(href: string | undefined): string | null {
	if (!href || !/^https?:\/\//i.test(href)) return null;
	try { return new URL(href).hostname.replace(/^www\./, ""); } catch { return null; }
}

export function createProjectAgentMarkdownComponents(sources: ProjectAgentTaskSource[] = [], resolveImage?: (src: string) => string | null, images: Record<string, ImagePresentation> = {}, enable3DViewer = false, language = "en"): Components {
	const sourceTitles = new Map(sources.map((source) => [sourceKey(source.url), source.title]));
	return {
	a: ({ href, children, node }) => {
		if (node?.children.some((child) => child.type === "element" && child.tagName === "img")) return <>{children}</>;
		const host = externalHost(href);
		if (!host || !href) return <a href={href}>{children}</a>;
		const label = typeof children === "string" ? children : Array.isArray(children) && children.every((child) => typeof child === "string") ? children.join("") : "";
		const isBareUrl = !label || label === href || /^https?:\/\//i.test(label);
		const visibleLabel = isBareUrl || label.length > 28 ? host : label;
		return <ProjectAgentSourceLink href={href} host={host} label={visibleLabel} title={sourceTitles.get(sourceKey(href)) || (isBareUrl ? host : label)} />;
	},
	pre: ({ children }) => {
		const code = Array.isArray(children) ? children[0] : children;
		if (isValidElement(code)) {
			const props = (code as ReactElement<{ className?: string; children?: unknown }>).props;
			const classes = typeof props.className === "string" ? props.className.split(/\s+/) : [];
			const text = typeof props.children === "string" ? props.children : String(props.children ?? "");
			if (classes.includes("language-ong-ui")) return <ProjectAgentRichBlock source={text} enable3DViewer={enable3DViewer} language={language} />;
			if (classes.includes("language-ong-doc")) return <ProjectAgentDocumentCard source={text} />;
			if (classes.includes("language-mermaid")) return <ProjectAgentRichBlock source={JSON.stringify({ type: "mermaid", code: text })} />;
			return <ProjectAgentCodeBlock language={classes.find((name) => name.startsWith("language-"))?.slice(9) ?? ""} code={text} />;
		}
		return <pre>{children}</pre>;
	},
	code: ({ className, children }) => className ? <code className={className}>{children}</code> : <code className="not-prose rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800 before:content-none after:content-none dark:bg-slate-800 dark:text-slate-100">{children}</code>,
	blockquote: ({ children }) => <blockquote className="not-prose my-4 rounded-r-lg border-l-4 border-orange-300 bg-orange-50/50 px-4 py-2 text-slate-700 dark:border-orange-500/60 dark:bg-orange-950/20 dark:text-slate-300 [&>p]:my-1">{children}</blockquote>,
	span: ({ node: _node, className, children, ...props }) => className?.split(" ").includes("katex-display")
		? <span {...props} className={`${className} block max-w-full overflow-x-auto`} role="region" aria-label="Scrollable formula" tabIndex={0}>{children}</span>
		: <span {...props} className={className}>{children}</span>,
	hr: () => <hr className="not-prose my-6 border-slate-200 dark:border-slate-700" />,
	img: ({ src, alt, title }) => {
		if (typeof src !== "string") return null;
		const url = resolveImage?.(src) ?? (resolveImage && isLocalImageSource(src) ? null : src);
		if (!url) return null;
		const explicitSize = title === "inline" || title === "reference" ? title : undefined;
		return <ProjectAgentFigure src={url} alt={alt?.trim() ?? ""} presentation={images[src] ?? { size: explicitSize }} />;
	},
	p: ({ children, node }) => node?.children.some((child) => child.type === "element" && (child.tagName === "img" || (child.tagName === "a" && child.children.some((nested) => nested.type === "element" && nested.tagName === "img"))))
		? <div className="my-4">{children}</div> : <p>{children}</p>,
	table: ({ children }) => (
		<div
			role="region"
			aria-label="Scrollable response table"
			tabIndex={0}
			className="not-prose my-5 w-full overflow-x-auto rounded-xl border border-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 dark:border-slate-700"
		>
			<table className="min-w-full border-collapse text-left text-sm">{children}</table>
		</div>
	),
	thead: ({ children }) => <thead className="bg-slate-50 dark:bg-slate-800/80">{children}</thead>,
	tbody: ({ children }) => <tbody className="divide-y divide-slate-200 dark:divide-slate-700">{children}</tbody>,
	th: ({ children }) => (
		<th scope="col" className="whitespace-nowrap border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:text-slate-300">
			{children}
		</th>
	),
	td: ({ children }) => (
		<td className="min-w-28 px-4 py-3 align-top text-sm leading-6 text-slate-700 dark:text-slate-300">{children}</td>
	),
	};
}

function sourceKey(url: string): string {
	try { const parsed = new URL(url); parsed.hash = ""; return parsed.href; } catch { return url; }
}

export const projectAgentMarkdownComponents: Components = createProjectAgentMarkdownComponents();
