"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { RichAskBlock } from "@/lib/project-agent/rich-ui";

const OTHER = "__other__";

export function ProjectAgentAskDock({ ask, onSubmit, onDismiss }: { ask: RichAskBlock; onSubmit: (text: string) => void; onDismiss: () => void }) {
	const total = ask.questions.length;
	const [step, setStep] = useState(0);
	const [picked, setPicked] = useState<string[][]>(() => ask.questions.map(() => []));
	const [custom, setCustom] = useState<string[]>(() => ask.questions.map(() => ""));
	const otherRef = useRef<HTMLInputElement>(null);
	const question = ask.questions[step];
	const answerOf = (index: number) => [...picked[index].filter((item) => item !== OTHER), ...(picked[index].includes(OTHER) && custom[index].trim() ? [custom[index].trim()] : [])];
	const answered = (index: number) => answerOf(index).length > 0;

	useEffect(() => { if (picked[step]?.includes(OTHER)) otherRef.current?.focus(); }, [step, picked]);

	function finish(next: string[][] = picked, nextCustom: string[] = custom) {
		const lines = ask.questions.map((item, index) => {
			const values = [...next[index].filter((value) => value !== OTHER), ...(next[index].includes(OTHER) && nextCustom[index].trim() ? [nextCustom[index].trim()] : [])];
			return `- ${item.question} ${values.length ? values.join(", ") : "(skipped)"}`;
		});
		onSubmit(`My answers:\n${lines.join("\n")}`);
	}
	function advance(next: string[][]) {
		if (step < total - 1) setStep(step + 1);
		else finish(next);
	}
	function choose(option: string) {
		const multi = question.multi;
		const current = picked[step];
		const updated = multi ? (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]) : [option];
		const next = picked.map((answer, index) => (index === step ? updated : answer));
		setPicked(next);
		if (!multi && option !== OTHER) advance(next);
	}

	const rows = [...question.options, OTHER];
	return (
		<div role="group" aria-label="Clarifying questions" className="mx-auto mb-2 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
			<div className="mb-2 flex items-start justify-between gap-3 px-1">
				<p className="text-sm font-medium text-slate-900 dark:text-slate-100">{question.question}{question.multi ? <span className="ml-1.5 text-xs font-normal text-slate-500">(select all that apply)</span> : null}</p>
				<div className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
					<button type="button" aria-label="Previous question" disabled={step === 0} onClick={() => setStep(step - 1)} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4" /></button>
					<span className="tabular-nums">{step + 1} / {total}</span>
					<button type="button" aria-label="Next question" disabled={step >= total - 1 || !answered(step)} onClick={() => setStep(step + 1)} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></button>
					<button type="button" aria-label="Dismiss questions" onClick={onDismiss} className="ml-1 rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
				</div>
			</div>
			<ul className="space-y-1">
				{rows.map((option, index) => {
					const on = picked[step].includes(option);
					const isOther = option === OTHER;
					return (
						<li key={option}>
							<div onClick={() => choose(option)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); choose(option); } }} aria-pressed={on} className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${on ? "bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-100" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"}`}>
								<span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs ${on ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300 text-slate-500 dark:border-slate-600"}`}>{on ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
								{isOther ? (
									<input key={step} ref={otherRef} value={custom[step]} onClick={(event) => event.stopPropagation()} onFocus={() => { if (!picked[step].includes(OTHER)) setPicked(picked.map((answer, i) => (i === step ? (question.multi ? [...answer, OTHER] : [OTHER]) : answer))); }} onChange={(event) => setCustom(custom.map((value, i) => (i === step ? event.target.value : value)))} onKeyDown={(event) => { if (event.key === "Enter" && custom[step].trim()) { event.preventDefault(); const next = picked.map((answer, i) => (i === step ? (question.multi ? Array.from(new Set([...answer, OTHER])) : [OTHER]) : answer)); setPicked(next); advance(next); } }} placeholder="Other (type your own answer)" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400" />
								) : <span className="min-w-0 flex-1">{option}</span>}
							</div>
						</li>
					);
				})}
			</ul>
			<div className="mt-2 flex items-center justify-between gap-2 px-1 pt-1">
				<button type="button" onClick={() => onSubmit("Choose the most reasonable assumptions, state them clearly and continue.")} className="text-xs text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline dark:hover:text-slate-200">You choose for me</button>
				<div className="flex items-center gap-2">
					<button type="button" onClick={onDismiss} className="rounded-full px-3 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Skip</button>
					{(question.multi || step === total - 1) && (
						<button type="button" disabled={!answered(step)} onClick={() => advance(picked)} className="rounded-full bg-slate-900 px-4 py-1 text-xs font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900">{step === total - 1 ? "Send" : "Next"}</button>
					)}
				</div>
			</div>
		</div>
	);
}
