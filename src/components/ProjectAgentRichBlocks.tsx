"use client";

import { Component, memo, useMemo, useRef, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Download, Info, Share2, Table2, OctagonAlert } from "lucide-react";
import { AskBlock, FollowupsBlock } from "./ProjectAgentReply";
import { ProjectAgentExplorer } from "./ProjectAgentExplorer";
import { ProjectAgentScene3D } from "./ProjectAgentScene3D";
import { ProjectAgentInteractive } from "./ProjectAgentInteractive";
import { ProjectAgentQuiz } from "./ProjectAgentQuiz";
import { ProjectAgentFormBlock } from "./ProjectAgentFormBlock";
import { ProjectAgentMermaid } from "./ProjectAgentMermaid";
import { parseRichUiBlock, type RichTone, type RichUiBlock } from "@/lib/project-agent/rich-ui";
import { responseLabels } from "../../shared/project-agent/response-locale";

const AXIS_TICK = { fontSize: 11 } as const;
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

// Memoized with stable data and props: recharts re-dispatches axis ticks whenever these change identity, which loops on re-render.
const ChartBlock = memo(function ChartBlock({ block, language = "en" }: { block: Extract<RichUiBlock, { type: "chart" }>; language?: string }) {
	const labels = responseLabels(language);
	const chartRef = useRef<HTMLDivElement>(null);
	const [showTable, setShowTable] = useState(false);
	const [shareError, setShareError] = useState("");
	const data = useMemo(() => block.categories.map((name, index) => Object.fromEntries([["name", name], ...block.series.map((series) => [series.name, series.values[index]])])), [block]);
	const unit = block.unit ? ` ${block.unit}` : "";
	const formatter = useMemo(() => (value: unknown) => `${typeof value === "number" ? value.toLocaleString(labels.locale) : String(value)}${unit}`, [unit, labels.locale]);
	const tooltip = <Tooltip formatter={formatter} />;
	async function exportChart(share: boolean) {
		const svg = chartRef.current?.querySelector("svg");
		if (!svg) return setShareError("The chart is still loading.");
		try {
			const clone = svg.cloneNode(true) as SVGSVGElement;
			const box = svg.getBoundingClientRect();
			clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
			clone.setAttribute("width", String(Math.max(1, Math.ceil(box.width))));
			clone.setAttribute("height", String(Math.max(1, Math.ceil(box.height))));
			const image = new Image();
			const source = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }));
			try {
				const png = await new Promise<Blob>((resolve, reject) => {
					image.onload = () => { const canvas = document.createElement("canvas"); canvas.width = Math.ceil(box.width * 2); canvas.height = Math.ceil(box.height * 2); const context = canvas.getContext("2d"); if (!context) return reject(new Error("Canvas unavailable")); context.scale(2, 2); context.fillStyle = "white"; context.fillRect(0, 0, box.width, box.height); context.drawImage(image, 0, 0, box.width, box.height); canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not export chart")), "image/png"); };
					image.onerror = () => reject(new Error("Could not render chart image")); image.src = source;
				});
				if (share && navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
					await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
				} else {
					const link = document.createElement("a"); const downloadUrl = URL.createObjectURL(png); link.href = downloadUrl; link.download = `${(block.title || "chart").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "chart"}.png`; link.click(); window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 15000);
				}
				setShareError(share ? (typeof navigator.clipboard?.write === "function" && typeof ClipboardItem !== "undefined" ? "Chart image copied." : "Sharing is unavailable; chart image downloaded instead.") : "");
			} finally { URL.revokeObjectURL(source); }
		} catch { setShareError(share ? "Could not copy chart image." : "Could not download chart image."); }
	}
	return (
		<Card title={block.title} caption={block.caption}>
			<div className="mb-2 flex flex-wrap justify-end gap-1">
				<button type="button" onClick={() => void exportChart(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label={labels.shareImage}><Share2 className="h-3.5 w-3.5" />{labels.share}</button>
				<button type="button" onClick={() => void exportChart(false)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label={labels.downloadImage}><Download className="h-3.5 w-3.5" />{labels.download}</button>
				<button type="button" onClick={() => setShowTable((value) => !value)} aria-pressed={showTable} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Table2 className="h-3.5 w-3.5" />{showTable ? labels.chart : labels.table}</button>
			</div>
			{shareError && <p role="status" className="mb-2 text-right text-xs text-slate-500">{shareError}</p>}
			{showTable ? <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700"><table className="min-w-full text-left text-xs"><caption className="sr-only">{block.title || "Chart data"}: {labels.exactValues}</caption><thead className="bg-slate-50 dark:bg-slate-800"><tr><th scope="col" className="px-3 py-2">{labels.category}</th>{block.series.map((series) => <th key={series.name} scope="col" className="px-3 py-2">{series.name}{unit}</th>)}</tr></thead><tbody>{block.categories.map((category, index) => <tr key={`${category}-${index}`} className="border-t border-slate-100 dark:border-slate-800"><th scope="row" className="px-3 py-2 font-medium">{category}</th>{block.series.map((series) => <td key={series.name} className="px-3 py-2 tabular-nums">{(series.values[index]).toLocaleString(labels.locale)}{unit}</td>)}</tr>)}</tbody></table></div> : <div className="w-full overflow-x-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50" role="region" aria-label={`${labels.scrollableChart}: ${block.title || labels.chart}`} tabIndex={0}>
                <div ref={chartRef} className="h-72 w-full" style={{ minWidth: block.categories.length > 6 ? Math.min(960, block.categories.length * 88) : undefined }} role="img" aria-label={block.title ?? "Chart"}>
				<ResponsiveContainer width="100%" height="100%">
					{block.kind === "pie" ? (
						<PieChart>
							<Pie data={data} dataKey={block.series[0].name} nameKey="name" outerRadius="78%" label={block.categories.length <= 5 && block.categories.every((name) => name.length <= 12)}>
								{data.map((_, index) => <Cell key={index} fill={PALETTE[index % PALETTE.length]} />)}
							</Pie>
							{tooltip}
							<Legend />
						</PieChart>
					) : block.kind === "line" ? (
						<LineChart data={data}>
							<CartesianGrid strokeDasharray="3 3" vertical={false} />
							<XAxis dataKey="name" tick={AXIS_TICK} />
							<YAxis tick={AXIS_TICK} />
							{tooltip}
							{block.series.length > 1 && <Legend />}
							{block.series.map((series, index) => <Line key={series.name} type="linear" dataKey={series.name} stroke={PALETTE[index % PALETTE.length]} strokeWidth={2} dot={{ r: 3 }} />)}
						</LineChart>
					) : (
						<BarChart data={data}>
							<CartesianGrid strokeDasharray="3 3" vertical={false} />
							<XAxis dataKey="name" tick={AXIS_TICK} />
							<YAxis tick={AXIS_TICK} />
							{tooltip}
							{block.series.length > 1 && <Legend />}
							{block.series.map((series, index) => <Bar key={series.name} dataKey={series.name} fill={PALETTE[index % PALETTE.length]} stackId={block.kind === "stacked" ? "stack" : undefined} radius={block.kind === "stacked" ? 0 : [4, 4, 0, 0]} />)}
						</BarChart>
					)}
				</ResponsiveContainer>
			</div></div>}
		</Card>
	);
});

const CALLOUT_ICON: Record<RichTone, typeof Info> = { neutral: Info, info: Info, success: CheckCircle2, warning: AlertTriangle, danger: OctagonAlert };

function RichBlock({ source, enable3DViewer = false, language = "en" }: { source: string; enable3DViewer?: boolean; language?: string }) {
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
			return <ChartBlock block={block} language={language} />;
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
		case "scene3d":
			return enable3DViewer ? <ProjectAgentScene3D block={block} /> : <VisualFallback />;
		case "ask":
			return <AskBlock block={block} />;
		case "form":
			return <ProjectAgentFormBlock block={block} />;
		case "interactive":
			return <ProjectAgentInteractive block={block} language={language} />;
		case "quiz":
			return <ProjectAgentQuiz block={block} language={language} />;
		case "followups":
			return <FollowupsBlock block={block} />;
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

export function ProjectAgentRichBlock({ source, enable3DViewer = false, language = "en" }: { source: string; enable3DViewer?: boolean; language?: string }) {
  return <VisualBoundary key={source}><RichBlock source={source} enable3DViewer={enable3DViewer} language={language} /></VisualBoundary>;
}
