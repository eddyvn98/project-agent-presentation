"use client";

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Copy, Download, Loader2, Table2 } from "lucide-react";
import type { RichUiBlock } from "@/lib/project-agent/rich-ui";
import { chartImageBlob, downloadChartImage } from "./chart-image-export";
import { ProjectAgentTable } from "./ProjectAgentTable";

const AXIS_TICK = { fontSize: 11 } as const;
const PALETTE = ["#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2", "#b07aa1", "#edc948", "#9c755f"];
const CONTROL = "inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800";

function Card({ title, caption, children }: { title?: string; caption?: string; children: ReactNode }) {
  return <figure className="not-prose my-5 min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
    {title && <figcaption className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</figcaption>}
    {children}
    {caption && <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{caption}</p>}
  </figure>;
}

// Stable internal data keys keep user-facing series names from overwriting categories or becoming object paths.
const ChartBlock = memo(function ChartBlock({ block }: { block: Extract<RichUiBlock, { type: "chart" }> }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const exportRequest = useRef(0);
  const [showTable, setShowTable] = useState(false);
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  const [canCopy, setCanCopy] = useState(false);
  const series = useMemo(() => block.series.map((item, index) => ({ ...item, key: `series_${index}` })), [block.series]);
  const data = useMemo(() => block.categories.map((category, index) => ({
    categoryLabel: category, ...Object.fromEntries(series.map((item) => [item.key, item.values[index]])),
  })), [block.categories, series]);
  const unit = block.unit ? ` ${block.unit}` : "";
  const formatter = useMemo(() => (value: unknown) => `${typeof value === "number" ? value.toLocaleString() : String(value)}${unit}`, [unit]);
  const tooltip = <Tooltip formatter={formatter} />;
  const values = block.series.flatMap((item) => item.values);
  const extent = block.kind === "stacked" ? block.categories.flatMap((_, index) => [
    series.reduce((sum, item) => sum + Math.max(0, item.values[index]), 0),
    series.reduce((sum, item) => sum + Math.min(0, item.values[index]), 0),
  ]) : values;
  const finiteRange = values.every(Number.isFinite) && extent.every(Number.isFinite) &&
    Number.isFinite(Math.max(0, ...extent) - Math.min(0, ...extent));
  const total = block.series[0]?.values.reduce((sum, value) => sum + value, 0) ?? 0;
  const chartIssue = !finiteRange ? "This value range cannot be plotted reliably. The supplied data is shown below." :
    block.kind === "pie" && (series.length !== 1 || values.some((value) => value < 0) || !Number.isFinite(total) || total <= 0)
      ? "A pie chart needs one non-negative series with a positive total. The supplied data is shown below." : "";
  const tableVisible = showTable || !!chartIssue;
  useEffect(() => {
    setCanCopy(!!navigator.clipboard?.write && typeof ClipboardItem !== "undefined");
  }, []);
  useEffect(() => {
    exportRequest.current += 1;
    setStatus(""); setExporting(false);
    return () => { exportRequest.current += 1; };
  }, [block]);
  async function exportChart(action: "copy" | "download") {
    const svg = chartRef.current?.querySelector<SVGSVGElement>("svg.recharts-surface");
    if (!svg) { setStatus("Switch to the chart view before exporting an image."); return; }
    if (action === "copy" && !canCopy) { setStatus("Image copying is unavailable in this browser. Use Download instead."); return; }
    const request = ++exportRequest.current;
    setStatus(""); setExporting(true);
    try {
      const legend = block.kind === "pie"
        ? block.categories.map((label, index) => ({ label: `${label}: ${formatter(series[0].values[index])}`, color: PALETTE[index % PALETTE.length] }))
        : series.map((item, index) => ({ label: `${item.name}${unit}`, color: PALETTE[index % PALETTE.length] }));
      const png = await chartImageBlob(svg, block.title || "Chart", legend);
      if (request !== exportRequest.current) return;
      if (action === "copy") await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      else downloadChartImage(png, block.title || "chart");
      if (request === exportRequest.current) setStatus(action === "copy" ? "Chart image copied." : "Chart download requested.");
    } catch {
      if (request === exportRequest.current) setStatus(action === "copy" ? "Could not copy chart image. You can download it instead." : "Could not download chart image.");
    } finally { if (request === exportRequest.current) setExporting(false); }
  }
  return <Card title={block.title} caption={block.caption}>
    <div className="mb-2 flex flex-wrap justify-end gap-1">
      <button type="button" onClick={() => void exportChart("copy")} className={CONTROL}
        disabled={tableVisible || exporting || !canCopy} title={!canCopy ? "Image copying is unavailable; use Download" : "Copy chart image"} aria-label="Copy chart as image">
        <Copy aria-hidden className="h-3.5 w-3.5" />Copy image
      </button>
      <button type="button" onClick={() => void exportChart("download")} className={CONTROL}
        disabled={tableVisible || exporting} aria-label="Download chart as image">
        {exporting ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : <Download aria-hidden className="h-3.5 w-3.5" />}Download
      </button>
      <button type="button" onClick={() => { setShowTable((value) => !value); setStatus(""); }} aria-pressed={tableVisible}
        disabled={!!chartIssue || exporting} className={CONTROL}><Table2 aria-hidden className="h-3.5 w-3.5" />{tableVisible ? "Show chart" : "Table"}</button>
    </div>
    {status && <p role="status" className="mb-2 text-right text-xs text-slate-500">{status}</p>}
    {chartIssue && <p role="status" className="mb-2 text-sm text-slate-500">{chartIssue}</p>}
    {tableVisible ? <ProjectAgentTable label={`${block.title || "Chart"} data`}>
      <thead><tr><th scope="col">Category</th>{series.map((item) => <th scope="col" key={item.key}>{item.name}{unit}</th>)}</tr></thead>
      <tbody>{block.categories.map((category, index) => <tr key={`${category}-${index}`}>
        <th scope="row">{category}</th>{series.map((item) => <td key={item.key}>{formatter(item.values[index])}</td>)}
      </tr>)}</tbody>
    </ProjectAgentTable> : <div ref={chartRef} className="h-64 min-w-0 w-full" role="img" aria-label={block.title ?? "Chart"}>
      <ResponsiveContainer width="100%" height="100%">
        {block.kind === "pie" ? <PieChart>
          <Pie data={data} dataKey="series_0" nameKey="categoryLabel" outerRadius="80%" label isAnimationActive={false}>
            {data.map((_, index) => <Cell key={index} fill={PALETTE[index % PALETTE.length]} />)}
          </Pie>{tooltip}<Legend />
        </PieChart> : block.kind === "line" ? <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="categoryLabel" tick={AXIS_TICK} /><YAxis tick={AXIS_TICK} />
          {tooltip}{series.length > 1 && <Legend />}
          {series.map((item, index) => <Line key={item.key} type="monotone" dataKey={item.key} name={item.name}
            stroke={PALETTE[index % PALETTE.length]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />)}
        </LineChart> : <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="categoryLabel" tick={AXIS_TICK} /><YAxis tick={AXIS_TICK} />
          {tooltip}{series.length > 1 && <Legend />}
          {series.map((item, index) => <Bar key={item.key} dataKey={item.key} name={item.name}
            fill={PALETTE[index % PALETTE.length]} stackId={block.kind === "stacked" ? "stack" : undefined} radius={block.kind === "stacked" ? 0 : [4, 4, 0, 0]} isAnimationActive={false} />)}
        </BarChart>}
      </ResponsiveContainer>
    </div>}
  </Card>;
});

export default ChartBlock;
