"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { Loader2, Square } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { ProjectAgentTaskSource } from "@/lib/project-agent/types";
import { activityText, type ActivityLanguage } from "@/lib/project-agent/activity-language";
import { completedStreamingMarkdown, splitPresentationSections } from "@/lib/project-agent/presentation-mode";
import { createProjectAgentMarkdownComponents, normalizeProjectAgentMarkdown } from "./ProjectAgentMarkdown";
import type { ImagePresentation } from "./ProjectAgentFigure";

type Props = {
	markdown: string;
	sources: ProjectAgentTaskSource[];
	resolveImage: (src: string) => string | null;
	images?: Record<string, ImagePresentation>;
	presentation?: boolean;
	enable3DViewer?: boolean;
	running?: boolean;
	language?: ActivityLanguage;
	onStop?: () => void;
};

export function ProjectAgentTaskAnswer({ markdown, sources, resolveImage, images = {}, presentation = false, enable3DViewer = false, running = false, onStop, language = "en" }: Props) {
	const [presenting, setPresenting] = useState(false);
	const [slide, setSlide] = useState(0);
	const stream = useMemo(() => running ? completedStreamingMarkdown(markdown) : { text: markdown, pending: false }, [markdown, running]);
	const normalized = useMemo(() => normalizeProjectAgentMarkdown(stream.text), [stream.text]);
	const sections = useMemo(() => splitPresentationSections(normalized), [normalized]);
	const canPresent = presentation && !running && sections.length > 1;
	const index = Math.min(slide, sections.length - 1);
	const visible = presenting && canPresent ? sections[index] : normalized;
	const components = useMemo(() => createProjectAgentMarkdownComponents(sources, resolveImage, images, enable3DViewer, language), [sources, resolveImage, images, enable3DViewer, language]);
	const move = (next: number) => setSlide(Math.max(0, Math.min(sections.length - 1, next)));
	const onKeys = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!presenting || !canPresent || event.altKey || event.ctrlKey || event.metaKey) return;
		if ((event.target as HTMLElement).closest("input, select, textarea, [role=slider]")) return;
		if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); move(index + 1); }
		else if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); move(index - 1); }
		else if (event.key === "Escape") setPresenting(false);
	};

	return <div className={`prose prose-sm max-w-none break-words dark:prose-invert prose-p:my-3 prose-headings:mb-2 prose-headings:mt-6 prose-li:my-1 ${presenting && canPresent ? "agent-deck" : ""}`} onKeyDown={onKeys} tabIndex={presenting && canPresent ? 0 : undefined}>
		{canPresent && <nav className="not-prose mb-3 flex flex-wrap items-center gap-2" aria-label="Answer presentation controls">
			{presenting ? <>
				<button type="button" disabled={index === 0} onClick={() => move(index - 1)} aria-label="Previous slide" className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Previous</button>
				<output aria-live="polite" className="text-sm tabular-nums">{index + 1} / {sections.length}</output>
				<button type="button" disabled={index === sections.length - 1} onClick={() => move(index + 1)} aria-label="Next slide" className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Next</button>
				<button type="button" onClick={() => { setPresenting(false); setSlide(0); }} className="rounded-lg border px-3 py-2 text-sm">Read full answer</button>
			</> : <button type="button" onClick={() => { setPresenting(true); setSlide(0); }} className="rounded-lg border px-3 py-2 text-sm">Present as slides</button>}
		</nav>}
		<ReactMarkdown skipHtml remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]} rehypePlugins={[[rehypeKatex, { throwOnError: false, trust: false, strict: "error", maxExpand: 200, maxSize: 20 }]]} components={components}>{visible}</ReactMarkdown>
		{stream.pending && <p role="status" className="not-prose mt-3 text-xs text-slate-500">{activityText(language).working}…</p>}
		{running && <p className="not-prose flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3 w-3 animate-spin" />{activityText(language).working}…{onStop && <button type="button" onClick={onStop} className="ml-2 inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><Square className="h-3 w-3" />Stop</button>}</p>}
	</div>;
}
