"use client";

import { useMemo, useState } from "react";
import { evaluateExpression, type InteractiveModel } from "@/lib/project-agent/interactive-model";

const formatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const display = (value: number | null, unit?: string) =>
  value === null ? "Unable to calculate" : `${formatter.format(value)}${unit ? ` ${unit}` : ""}`;

/** An interactive chart driven entirely by a bounded expression AST; never executes model code. */
export function ProjectAgentInteractive({ block }: { block: InteractiveModel }) {
  const [values, setValues] = useState<Record<string, number>>(
    () => Object.fromEntries(block.parameters.map((p) => [p.id, p.initial])),
  );
  const [showTable, setShowTable] = useState(false);
  const outputs = useMemo(
    () => block.outputs.map((item) => ({ ...item, value: evaluateExpression(item.expression, values) })),
    [block.outputs, values],
  );
  const points = useMemo(() => {
    if (!block.plot) return [];
    const parameter = block.parameters.find((p) => p.id === block.plot?.variable);
    if (!parameter) return [];
    const count = Math.min(40, Math.max(2, Math.ceil((parameter.max - parameter.min) / parameter.step) + 1));
    return Array.from({ length: count }, (_, index) => {
      const x = parameter.min + (index / (count - 1)) * (parameter.max - parameter.min);
      return { x, y: evaluateExpression(block.plot!.expression, { ...values, [parameter.id]: x }) };
    });
  }, [block.parameters, block.plot, values]);
  const valid = points.filter((p): p is { x: number; y: number } => p.y !== null);
  const yMin = valid.length ? Math.min(...valid.map((p) => p.y)) : 0;
  const yMax = valid.length ? Math.max(...valid.map((p) => p.y)) : 0;
  const xMin = points[0]?.x ?? 0, xMax = points[points.length - 1]?.x ?? 1;
  const xy = (x: number, y: number) =>
    `${40 + ((x - xMin) / (xMax - xMin || 1)) * 520},${155 - ((y - yMin) / (yMax - yMin || 1)) * 125}`;

  return <figure className="not-prose my-5 min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-label={block.title}>
    <figcaption className="text-base font-semibold text-slate-900 dark:text-slate-100">{block.title}</figcaption>
    {block.description && <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{block.description}</p>}
    <div className="mt-4 grid gap-4">
      {block.parameters.map((p) => <label key={p.id} className="block text-sm text-slate-700 dark:text-slate-200">
        <span className="flex items-center justify-between gap-3"><span>{p.label}</span><output className="font-semibold tabular-nums">{display(values[p.id], p.unit)}</output></span>
        <input className="mt-2 block h-7 w-full cursor-pointer accent-orange-600" type="range"
          min={p.min} max={p.max} step={p.step} value={values[p.id]} aria-label={p.label}
          onChange={(event) => {
            const value = Number(event.currentTarget.value);
            setValues((previous) => ({ ...previous, [p.id]: value }));
          }} />
      </label>)}
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-live="polite">
      {outputs.map((item, index) => <div key={index} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
        <p className="text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
        <output className="mt-1 block break-words text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{display(item.value, item.unit)}</output>
      </div>)}
    </div>
    {block.plot && <div className="mt-4 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{block.plot.label}</p>
        <button type="button" aria-pressed={showTable} onClick={() => setShowTable((old) => !old)}
          className="rounded border px-3 py-1.5 text-xs text-slate-600 dark:text-slate-200">{showTable ? "Show chart" : "Show data"}</button>
      </div>
      {showTable ? <div className="mt-2 max-h-56 overflow-auto rounded border">
        <table className="w-full text-left text-xs"><thead><tr><th className="p-2">Input</th><th className="p-2">Result</th></tr></thead>
          <tbody>{points.map((p, i) => <tr key={i}><td className="border-t p-2 tabular-nums">{formatter.format(p.x)}</td><td className="border-t p-2 tabular-nums">{display(p.y)}</td></tr>)}</tbody>
        </table>
      </div> : valid.length > 1 ? <svg viewBox="0 0 600 180" className="mt-2 block h-auto w-full rounded-lg bg-slate-50" role="img"
        aria-label={`${block.plot.label}: plotted from ${formatter.format(xMin)} to ${formatter.format(xMax)}`}>
        <path d="M40 10 V155 H570" stroke="#94a3b8" fill="none" strokeWidth="1.5" />
        <polyline points={valid.map((p) => xy(p.x, p.y)).join(" ")} fill="none" stroke="#ea580c" strokeWidth="3" strokeLinejoin="round" />
        <text x="42" y="20" fontSize="12" fill="#334155">{formatter.format(yMax)}</text>
        <text x="42" y="148" fontSize="12" fill="#334155">{formatter.format(yMin)}</text>
        <text x="40" y="174" fontSize="12" fill="#334155">{formatter.format(xMin)}</text>
        <text x="560" y="174" textAnchor="end" fontSize="12" fill="#334155">{formatter.format(xMax)}</text>
      </svg> : <p role="status" className="mt-2 text-sm text-slate-500">Chart unavailable for these values.</p>}
    </div>}
    <p className="mt-3 text-xs leading-5 text-slate-500">Illustrative model. Outputs are calculated from the supplied parameters and expressions; verify assumptions before making decisions.</p>
  </figure>;
}
