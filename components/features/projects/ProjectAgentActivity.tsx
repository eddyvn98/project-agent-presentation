"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Globe, Loader2, MessageSquareText, SkipForward, Wrench } from "lucide-react";
import type { ProjectAgentTaskSource } from "@/lib/project-agent/types";
import type { ProjectAgentActivityStep } from "@/lib/project-agent/public-task";
import { activityText, type ActivityLanguage } from "@/lib/project-agent/activity-language";
import { agentToolReturnedText } from "@/lib/project-agent/activity-stage";
import { ProjectAgentSourceLink } from "./ProjectAgentSourceLink";
import { ProjectAgentZoomImage } from "./ProjectAgentZoomImage";

const ICONS = { search: Globe, read: FileText, other: Wrench, update: MessageSquareText } as const;

export interface ActivitySource { host: string; url: string }

export function extractSources(markdown: string | undefined): ActivitySource[] {
	if (!markdown) return [];
	const byHost = new Map<string, ActivitySource>();
	for (const [, url] of markdown.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
		try { const host = new URL(url).hostname.replace(/^www\./, ""); if (!byHost.has(host)) byHost.set(host, { host, url }); } catch { /* ignore malformed link */ }
	}
	return [...byHost.values()];
}

function sourceKey(url: string): string {
	try { const parsed = new URL(url); parsed.hash = ""; return parsed.href; } catch { return url; }
}

function sourceHost(url: string): string | null {
	try { const parsed = new URL(url); return /^https?:$/.test(parsed.protocol) ? parsed.hostname.replace(/^www\./, "") : null; } catch { return null; }
}

export function citedProjectAgentSources(markdown: string, sources: ProjectAgentTaskSource[] = []): ProjectAgentTaskSource[] {
	const byUrl = new Map((sources ?? []).map((source) => [sourceKey(source.url), source]));
	const ordered = new Map<string, ProjectAgentTaskSource>();
	for (const [, , url] of markdown.matchAll(/\[(\d+)\]\(\s*<?(https?:\/\/[^)\s>]+)>?\s*\)/g)) {
		const key = sourceKey(url);
		const host = sourceHost(url);
		if (host && !ordered.has(key)) ordered.set(key, byUrl.get(key) ?? { url, title: host, fetchedAt: "", sourceType: "search" });
	}
	if (ordered.size) return [...ordered.values()];
	for (const source of sources) if (sourceHost(source.url) && !ordered.has(sourceKey(source.url))) ordered.set(sourceKey(source.url), source);
	if (!ordered.size) for (const source of extractSources(markdown)) ordered.set(sourceKey(source.url), { url: source.url, title: source.host, fetchedAt: "", sourceType: "search" });
	return [...ordered.values()];
}

export function ProjectAgentSourceList({ markdown, sources }: { markdown: string; sources?: ProjectAgentTaskSource[] }) {
	const ordered = citedProjectAgentSources(markdown, sources);
	if (!ordered.length) return null;
	return <div aria-label="Sources" className="not-prose mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><span className="mr-0.5 font-medium">Sources</span><ol className="flex flex-wrap gap-1.5">{ordered.map((source, index) => {
		const host = sourceHost(source.url)!;
		return <li key={sourceKey(source.url)}><ProjectAgentSourceLink href={source.url} host={host} label={String(index + 1)} title={source.title || host} /></li>;
	})}</ol></div>;
}

/** A page-sample image the agent looked at; the file may land a moment after its step shows up, so a miss is retried. */
function RenderThumb({ src, index }: { src: string; index: number }) {
	const [attempt, setAttempt] = useState(0);
	const [failed, setFailed] = useState(false);
	if (failed) return null;
	const shown = attempt ? `${src}?retry=${attempt}` : src;
	return (
		<ProjectAgentZoomImage src={shown} alt={`Rendered pages the agent looked at (${index})`} title={`What the agent looked at (render ${index})`} label={`Enlarge render ${index}`} className="shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm hover:border-orange-300 dark:border-slate-700">
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img key={attempt} src={shown} alt={`Rendered pages the agent looked at (${index})`} loading="lazy" className="h-20 w-auto" onError={() => { if (attempt < 6) window.setTimeout(() => setAttempt(attempt + 1), 2000); else setFailed(true); }} />
		</ProjectAgentZoomImage>
	);
}

export function ProjectAgentActivity({ activity, running, sources, progress, imageBase, onSkip, language = "en" }: { activity: ProjectAgentActivityStep[]; running: boolean; sources: ActivitySource[]; progress?: string; imageBase?: string; onSkip?: () => void; language?: ActivityLanguage }) {
	const [open, setOpen] = useState(running);
	const [technical, setTechnical] = useState(false);
	const ui = activityText(language);
	if (activity.length === 0 && sources.length === 0) return null;
	const total = activity.filter((step) => step.kind !== "update").reduce((sum, step) => sum + step.count, 0);
	const latest = activity.at(-1);
	const renders = imageBase ? activity.flatMap((step) => step.images ?? []).slice(-6) : [];
	const parts = [total ? `${total} ${ui.steps}` : "", sources.length ? `${sources.length} ${ui.sources}` : ""].filter(Boolean);
	const summary = running ? progress || latest?.label || ui.working : total > 0 ? ui.completed : ui.sources;
	return (
		<div className="not-prose mb-3 text-sm text-slate-600 dark:text-slate-300">
			<div className="flex items-center gap-2">
				<button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? ui.hide : ui.details} className="inline-flex min-w-0 items-center gap-1.5 rounded-md py-1 text-left hover:text-slate-900 dark:hover:text-slate-100">
					{running ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" /> : open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
					<span className="min-w-0 truncate font-medium">{summary}</span>
					{parts.length ? <span className="shrink-0 text-xs text-slate-400">· {parts.join(" · ")}</span> : null}
				</button>
				{running && onSkip ? <button type="button" onClick={onSkip} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><SkipForward className="h-3 w-3" />{ui.skip}</button> : null}
			</div>
			{renders.length ? <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">{renders.map((id, position) => <RenderThumb key={id} src={`${imageBase}${id}`} index={position + 1} />)}</div> : null}
			{open && activity.length > 0 ? (
				<ol aria-label={ui.details} aria-live={running ? "polite" : "off"} className="mt-2 space-y-2 border-l border-slate-200 pl-4 dark:border-slate-700">
					{activity.map((step, index) => {
						const Icon = ICONS[step.kind];
						return (
							<li key={`${step.label}-${index}`}>
								<p className={`flex items-start gap-2 text-sm leading-5 ${step.kind === "update" ? "font-medium text-slate-800 dark:text-slate-100" : "text-slate-600 dark:text-slate-300"}`}><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="min-w-0 break-words">{step.label}{step.count > 1 ? <span className="ml-1 text-xs font-normal text-slate-400">×{step.count}</span> : null}{step.returnedCount ? <span className="ml-1 text-xs font-normal text-slate-400">· {agentToolReturnedText(language)}{step.returnedCount < step.count ? ` (${step.returnedCount}/${step.count})` : ""}</span> : null}</span></p>
								{technical && step.details.length ? <ul className="mt-1 space-y-0.5 pl-5 text-xs text-slate-500 dark:text-slate-400">{step.details.slice(0, 8).map((detail, i) => <li key={`${detail}-${i}`} className="break-all">{detail}</li>)}</ul> : null}
							</li>
						);
					})}
				</ol>
			) : null}
			{open && activity.some((step) => step.details.length) && <button type="button" onClick={() => setTechnical(!technical)} aria-expanded={technical} className="ml-4 mt-2 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">{technical ? ui.hide : ui.details} · {technical ? "−" : "+"}</button>}
		</div>
	);
}
