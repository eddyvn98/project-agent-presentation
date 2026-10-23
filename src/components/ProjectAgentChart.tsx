"use client";

import { memo, useMemo, useRef, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Share2, Table2 } from "lucide-react";
import type { RichUiBlock } from "@/lib/project-agent/rich-ui";

const AXIS_TICK = { fontSize: 11 } as const;
const PALETTE = ["#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2", "#b07aa1", "#edc948", "#9c755f"];

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
const ChartBlock = memo(function ChartBlock({ block }: { block: Extract<RichUiBlock, { type: "chart" }> }) {
	const chartRef = useRef<HTMLDivElement>(null);
	const [showTable, setShowTable] = useState(false);
	const [shareError, setShareError] = useState("");
	const data = useMemo(() => block.categories.map((name, index) => Object.fromEntries([["name", name], ...block.series.map((series) => [series.name, series.values[index]])])), [block]);
	const unit = block.unit ? ` ${block.unit}` : "";
	const formatter = useMemo(() => (value: unknown) => `${typeof value === "number" ? value.toLocaleString() : String(value)}${unit}`, [unit]);
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
					const link = document.createElement("a"); link.href = URL.createObjectURL(png); link.download = `${(block.title || "chart").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "chart"}.png`; link.click(); URL.revokeObjectURL(link.href);
				}
				setShareError(share ? "Chart image copied." : "");
			} finally { URL.revokeObjectURL(source); }
		} catch { setShareError(share ? "Could not copy chart image." : "Could not download chart image."); }
	}
	return (
		<Card title={block.title} caption={block.caption}>
			<div className="mb-2 flex flex-wrap justify-end gap-1">
				<button type="button" onClick={() => void exportChart(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Share chart as image"><Share2 className="h-3.5 w-3.5" />Share</button>
				<button type="button" onClick={() => void exportChart(false)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Download chart as image"><Download className="h-3.5 w-3.5" />Download</button>
				<button type="button" onClick={() => setShowTable((value) => !value)} aria-pressed={showTable} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Table2 className="h-3.5 w-3.5" />{showTable ? "Chart" : "Table"}</button>
			</div>
			{shareError && <p role="status" className="mb-2 text-right text-xs text-slate-500">{shareError}</p>}
			{showTable ? <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 dark:bg-slate-800"><tr><th className="px-3 py-2">Category</th>{block.series.map((series) => <th key={series.name} className="px-3 py-2">{series.name}{unit}</th>)}</tr></thead><tbody>{block.categories.map((category, index) => <tr key={`${category}-${index}`} className="border-t border-slate-100 dark:border-slate-800"><th className="px-3 py-2 font-medium">{category}</th>{block.series.map((series) => <td key={series.name} className="px-3 py-2 tabular-nums">{(series.values[index]).toLocaleString()}{unit}</td>)}</tr>)}</tbody></table></div> : <div ref={chartRef} className="h-64 w-full" role="img" aria-label={block.title ?? "Chart"}>
				<ResponsiveContainer width="100%" height="100%">
					{block.kind === "pie" ? (
						<PieChart>
							<Pie data={data} dataKey={block.series[0].name} nameKey="name" outerRadius="80%" label>
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
							{block.series.map((series, index) => <Line key={series.name} type="monotone" dataKey={series.name} stroke={PALETTE[index % PALETTE.length]} strokeWidth={2} dot={{ r: 3 }} />)}
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
			</div>}
		</Card>
	);
});


export default ChartBlock;
