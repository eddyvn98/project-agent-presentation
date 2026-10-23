"use client";

import { useId, useState } from "react";
import { ProjectAgentVisualDialog } from "./ProjectAgentVisualDialog";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { RichScene, RichSceneColor, RichUiBlock } from "@/lib/project-agent/rich-ui";

type ExplorerBlock = Extract<RichUiBlock, { type: "explorer" }>;
const control = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-default disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";
const sceneColors: Record<RichSceneColor, string> = { blue: "#3b82f6", orange: "#f97316", yellow: "#eab308", green: "#22c55e", red: "#ef4444", purple: "#a855f7", slate: "#64748b", white: "#ffffff", black: "#111827" };

function ExplorerScene({ scene, id, compact = false }: { scene: RichScene; id: string; compact?: boolean }) {
	return (
		<svg viewBox="0 0 100 60" role="img" aria-label={scene.description} className="block h-auto w-full rounded-lg bg-white">
			<title>{scene.description}</title>
			<defs><marker id={`${id}-arrow`} markerWidth="4" markerHeight="4" refX="3.5" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z" fill={sceneColors.slate} /></marker></defs>
			{scene.elements.map((element, index) => {
				if (element.type === "circle") return <circle key={index} cx={element.x} cy={element.y} r={element.r} fill={sceneColors[element.fill]}>{element.label ? <title>{element.label}</title> : null}</circle>;
				if (element.type === "ellipse") return <ellipse key={index} cx={element.x} cy={element.y} rx={element.rx} ry={element.ry} fill="none" stroke={sceneColors[element.stroke]} strokeWidth="0.8" strokeDasharray={element.dashed ? "2 2" : undefined}>{element.label ? <title>{element.label}</title> : null}</ellipse>;
				if (element.type === "rect") return <rect key={index} x={element.x} y={element.y} width={element.width} height={element.height} rx="1.5" fill={sceneColors[element.fill]}>{element.label ? <title>{element.label}</title> : null}</rect>;
				if (element.type === "line") return <line key={index} x1={element.x1} y1={element.y1} x2={element.x2} y2={element.y2} stroke={sceneColors[element.stroke]} strokeWidth="1" strokeDasharray={element.dashed ? "2 2" : undefined} markerEnd={element.arrow ? `url(#${id}-arrow)` : undefined} />;
				if (compact) return null;
				return <text key={index} x={element.x} y={element.y} fill={sceneColors[element.fill]} fontSize={Math.max(3, element.size)} textAnchor={element.anchor}>{element.text}</text>;
			})}
		</svg>
	);
}

export function ProjectAgentExplorer({ block }: { block: ExplorerBlock }) {
	const [selected, setSelected] = useState(0);
	const id = useId().replace(/[^a-zA-Z0-9_-]/g, "-");
	const index = Math.min(selected, block.steps.length - 1);
	const step = block.steps[index];
	const previous = block.previousLabel ?? "Previous";
	const next = block.nextLabel ?? "Next";
	const controlLabel = block.controlLabel ?? "Choose a step";

	return (
		<section className="not-prose my-5 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-label={block.title}>
			<header className="border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-5">
				<h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{block.title}</h3>
				{block.intro ? <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{block.intro}</p> : null}
			</header>
			<div className="p-4 sm:p-5">
				<div className="flex items-center justify-between gap-3">
					<p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{step.label}</p>
					<span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">{index + 1} / {block.steps.length}</span>
				</div>
				<div className="mt-2 min-h-32 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60 sm:p-5" aria-live="polite" aria-atomic="true">
					{step.scene ? <div className="mb-3">
                        <div role="region" tabIndex={0} aria-label={`${step.title} scene, scroll to explore`} className="overflow-auto rounded-lg border bg-white">
                            <ExplorerScene scene={step.scene} id={`${id}-preview`} compact />
                        </div>
                        <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700 dark:text-slate-200" aria-label="Scene labels">
                            {step.scene.elements.map((element, i) => element.type === "text" ? <li key={i}>{element.text}</li> : "label" in element && element.label ? <li key={i}>{element.label}</li> : null)}
                        </ul>
                        <p className="mt-1 text-xs text-slate-500">Enlarge to inspect label positions and details.</p>
                        <div className="mt-2"><ProjectAgentVisualDialog label={`${step.title} scene`} width={1000}>
                            <ExplorerScene scene={step.scene} id={`${id}-enlarged`} />
                        </ProjectAgentVisualDialog></div>
                    </div> : null}
					{step.visual ? <p className="mb-3 break-words text-center text-2xl font-semibold tabular-nums text-slate-800 dark:text-slate-100">{step.visual}</p> : null}
					<h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">{step.title}</h4>
					<p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{step.text}</p>
				</div>
				<label className="mt-4 block text-xs text-slate-600 dark:text-slate-300">{controlLabel}
                    <select className="mt-1 block min-h-10 w-full rounded border bg-white px-2 text-sm text-slate-900" value={index} onChange={(event) => setSelected(Number(event.currentTarget.value))}>
                        {block.steps.map((item, i) => <option key={i} value={i}>{i + 1}. {item.label}</option>)}
                    </select>
                </label>
                <div className="mt-4 flex items-center gap-3">
					<label className="sr-only" htmlFor={`${id}-range`}>{controlLabel}</label>
					<input id={`${id}-range`} type="range" min={0} max={block.steps.length - 1} step={1} value={index} onChange={(event) => setSelected(Number(event.currentTarget.value))} aria-valuetext={step.label} className="h-2 min-w-0 flex-1 cursor-pointer accent-orange-600" />
				</div>
				<nav className="mt-3 flex items-center justify-between gap-3" aria-label={controlLabel}>
					<button type="button" className={control} disabled={index === 0} onClick={() => setSelected(Math.max(0, index - 1))}><ArrowLeft aria-hidden className="h-4 w-4" />{previous}</button>
					<button type="button" className={control} disabled={index === block.steps.length - 1} onClick={() => setSelected(Math.min(block.steps.length - 1, index + 1))}>{next}<ArrowRight aria-hidden className="h-4 w-4" /></button>
				</nav>
			</div>
		</section>
	);
}
