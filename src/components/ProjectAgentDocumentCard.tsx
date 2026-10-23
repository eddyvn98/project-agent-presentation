"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Download, Maximize2, X } from "lucide-react";
import { projectAgentMarkdownComponents } from "./ProjectAgentMarkdown";

/** The text of an `agent-doc` fence: an optional first line `title: ...`, then the Markdown body. */
export function parseDocumentCard(source: string): { title: string; body: string } {
	const match = source.match(/^\s*title:\s*(.+)\n([\s\S]*)$/i);
	if (match) return { title: match[1].trim().slice(0, 120), body: match[2].trim() };
	const heading = source.match(/^\s*#{1,3}\s+(.+)$/m);
	return { title: heading?.[1].trim().slice(0, 120) ?? "", body: source.trim() };
}

const slug = (title: string) => title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "document"; // vi-allow: strips Vietnamese diacritics from file names

function Body({ body }: { body: string }) {
	return <div className="max-w-none break-words text-sm leading-6 text-slate-800 dark:text-slate-200 [&_h1]:mb-3 [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_a]:text-orange-700 [&_a]:underline"><ReactMarkdown remarkPlugins={[remarkGfm]} components={projectAgentMarkdownComponents}>{body}</ReactMarkdown></div>;
}

/** A drafted piece of writing shown as its own card in the chat: copy, expand to read full screen, download as Markdown. */
export function ProjectAgentDocumentCard({ source }: { source: string }) {
	const { title, body } = useMemo(() => parseDocumentCard(source), [source]);
	const [expanded, setExpanded] = useState(false);
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (!expanded) return;
		const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
		window.addEventListener("keydown", escape);
		return () => window.removeEventListener("keydown", escape);
	}, [expanded]);
	if (!body) return <p className="not-prose my-3 animate-pulse text-xs text-slate-400">Writing…</p>;
	const copy = async () => {
		try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
	};
	const download = () => {
		const url = URL.createObjectURL(new Blob([body], { type: "text/markdown;charset=utf-8" }));
		const link = document.createElement("a");
		link.href = url; link.download = `${slug(title)}.md`; link.click();
		URL.revokeObjectURL(url);
	};
	const actions = (
		<div className="flex items-center gap-1 text-slate-500">
			<button type="button" onClick={copy} aria-label="Copy text" title="Copy text" className="rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">{copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button>
			<button type="button" onClick={download} aria-label="Download as Markdown" title="Download as Markdown" className="rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"><Download className="h-4 w-4" /></button>
			<button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Close" : "Expand"} title={expanded ? "Close" : "Expand"} className="rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">{expanded ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
		</div>
	);
	return <>
		<section aria-label="Writing" data-writing-title={title} className="my-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
			<header className="not-prose flex items-center justify-between px-4 pt-3 text-xs text-slate-500"><span>Writing</span>{actions}</header>
			<div className="max-h-[28rem] overflow-y-auto px-5 pb-5 pt-2"><Body body={body} /></div>
		</section>
		{expanded && createPortal(<div role="dialog" aria-modal="true" aria-label={title || "Writing"} className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-slate-950">
			<header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800"><strong className="truncate text-sm">{title || "Writing"}</strong>{actions}</header>
			<div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-3xl px-6 py-8"><Body body={body} /></div></div>
		</div>, document.body)}
	</>;
}
