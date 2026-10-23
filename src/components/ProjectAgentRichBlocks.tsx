"use client";

import { Component, lazy, Suspense, useMemo, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { AskBlock, FollowupsBlock } from "./ProjectAgentReply";
import { ProjectAgentExplorer } from "./ProjectAgentExplorer";
import { ProjectAgentFormBlock } from "./ProjectAgentFormBlock";
import { ProjectAgentMermaid } from "./ProjectAgentMermaid";
import { ProjectAgentInteractive } from "./ProjectAgentInteractive";
import { ProjectAgentQuiz } from "./ProjectAgentQuiz";
import { parseRichUiBlock, type RichTone, type RichUiBlock } from "@/lib/project-agent/rich-ui";

const ChartBlock = lazy(() => import("./ProjectAgentChart"));
const PALETTE = ["#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2", "#b07aa1", "#edc948", "#9c755f"];

const TONE_TEXT: Record<RichTone, string> = {
	neutral: "text-slate-900 dark:text-slate-100",
	info: "text-sky-700 dark:text-sky-300",
	success: "text-emerald-700 dark:text-emerald-300",
	warning: "text-amber-700 dark:text-amber-300",
	danger: "text-red-700 dark:text-red-300",
};
const TONE_BAR: Record<RichTone, string> = { neutral: "bg-slate-500", info: "bg-sky-500", success: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-red-500" };
const TONE_BOX: Record<RichTone, string> = {
	neutral: "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60",
	info: "border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30",
	success: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30",
	warning: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30",
	danger: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
};

function Card({ title, caption, children }: { title?: string; caption?: string; children: ReactNode }) {
	return (
		<figure className="not-prose my-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
			{title ? <figcaption className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</figcaption> : null}
			{children}
			{caption ? <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{caption}</p> : null}
		</figure>
	);
}

const CALLOUT_ICON: Record<RichTone, typeof Info> = { neutral: Info, info: Info, success: CheckCircle2, warning: AlertTriangle, danger: OctagonAlert };

function RichBlock({ source }: { source: string }) {
	const block = useMemo(() => parseRichUiBlock(source), [source]);
	if (!block) {
		return <VisualFallback />;
	}
	switch (block.type) {
		case "kpis":
			return (
				<div className="not-prose my-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))]">
					{block.items.map((item) => (
						<div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
							<p className="text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
							<p className={`mt-1 text-2xl font-semibold leading-tight ${TONE_TEXT[item.tone]}`}>{item.value}</p>
							{item.hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.hint}</p> : null}
						</div>
					))}
				</div>
			);
		case "chart":
			return <Suspense fallback={<p role="status" className="not-prose my-3 text-sm text-slate-500">Loading chart…</p>}><ChartBlock block={block} /></Suspense>;
		case "progress": {
			const percent = Math.max(0, Math.min(100, (block.value / block.max) * 100));
			return (
				<Card title={block.title}>
					<div className="flex items-baseline justify-between gap-3">
						<p className="text-xs text-slate-500 dark:text-slate-400">{block.value.toLocaleString()} / {block.max.toLocaleString()}</p>
						{block.label ? <p className={`text-sm font-semibold ${TONE_TEXT[block.tone]}`}>{block.label}</p> : null}
					</div>
					<div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} aria-label={block.title}>
						<div className={`h-full rounded-full ${TONE_BAR[block.tone === "neutral" ? "success" : block.tone]}`} style={{ width: `${percent}%` }} />
					</div>
					{block.note ? <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{block.note}</p> : null}
				</Card>
			);
		}
		case "stack": {
			const total = block.items.reduce((sum, item) => sum + item.value, 0);
			return (
				<Card title={block.title}>
					{block.total ? <p className="-mt-2 mb-3 text-right text-lg font-semibold text-slate-900 dark:text-slate-100">{block.total}</p> : null}
					<div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={block.title}>
						{block.items.map((item, index) => <div key={item.label} title={`${item.label}: ${item.display ?? item.value}`} style={{ width: `${(item.value / total) * 100}%`, background: PALETTE[index % PALETTE.length] }} />)}
					</div>
					<ul className="mt-4 grid gap-x-6 gap-y-3 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
						{block.items.map((item, index) => (
							<li key={item.label} className="flex items-start gap-2 text-xs">
								<span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[index % PALETTE.length] }} />
								<span><span className="block text-slate-500 dark:text-slate-400">{item.label}</span><span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.display ?? item.value.toLocaleString()}</span></span>
							</li>
						))}
					</ul>
				</Card>
			);
		}
		case "options":
			return (
				<div className="not-prose my-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
					{block.items.map((item) => (
						<div key={item.title} className={`rounded-xl border p-4 ${item.recommended ? "border-orange-400 ring-1 ring-orange-400/60" : "border-slate-200 dark:border-slate-700"} bg-white dark:bg-slate-900`}>
							<div className="flex items-start justify-between gap-2">
								<p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
								{item.badge ? <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE_BOX[item.recommended ? "success" : item.tone]} ${TONE_TEXT[item.recommended ? "success" : item.tone]}`}>{item.badge}</span> : null}
							</div>
							{item.price ? <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{item.price}</p> : null}
							{item.summary ? <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.summary}</p> : null}
							{item.points.length > 0 && <ul className="mt-3 space-y-1.5 text-xs leading-5 text-slate-700 dark:text-slate-300">{item.points.map((point) => <li key={point} className="flex gap-2"><span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />{point}</li>)}</ul>}
						</div>
					))}
				</div>
			);
		case "callout": {
			const Icon = CALLOUT_ICON[block.tone];
			return (
				<div className={`not-prose my-5 flex gap-3 rounded-xl border p-4 ${TONE_BOX[block.tone]}`} role="note">
					<Icon aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${TONE_TEXT[block.tone]}`} />
					<div className="text-sm leading-6 text-slate-700 dark:text-slate-300">{block.title ? <p className={`font-semibold ${TONE_TEXT[block.tone]}`}>{block.title}</p> : null}<p>{block.text}</p></div>
				</div>
			);
		}
		case "steps":
			return (
				<ol className="not-prose my-5 space-y-0 rounded-xl border border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-900">
					{block.items.map((item, index) => (
						<li key={`${item.title}-${index}`} className="flex gap-3 border-b border-slate-100 py-3 last:border-b-0 dark:border-slate-800">
							<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{index + 1}</span>
							<div className="min-w-0 flex-1">
								<div className="flex items-baseline justify-between gap-2"><p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>{item.meta ? <span className="shrink-0 text-xs text-slate-500">{item.meta}</span> : null}</div>
								{item.text ? <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.text}</p> : null}
							</div>
						</li>
					))}
				</ol>
			);
		case "explorer":
			return <ProjectAgentExplorer block={block} />;
		case "ask":
			return <AskBlock block={block} />;
		case "form":
			return <ProjectAgentFormBlock block={block} />;
		case "followups":
			return <FollowupsBlock block={block} />;
		case "quiz":
			return <ProjectAgentQuiz block={block} />;
		case "interactive":
			return <ProjectAgentInteractive block={block} />;
		case "mermaid":
			return <ProjectAgentMermaid code={block.code} title={block.title} caption={block.caption} />;
	}
}

function VisualFallback() {
  return <p role="status" className="not-prose my-3 text-sm text-slate-500">Visual unavailable. Continue with the accompanying explanation.</p>;
}

class VisualBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <VisualFallback /> : this.props.children; }
}

export function ProjectAgentRichBlock({ source }: { source: string }) {
  return <VisualBoundary key={source}><RichBlock source={source} /></VisualBoundary>;
}
