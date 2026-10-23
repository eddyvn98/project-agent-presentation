"use client";

import { useContext, useState } from "react";
import { Check, ClipboardList } from "lucide-react";
import type { RichUiBlock } from "@/lib/project-agent/rich-ui";
import { ReplyContext } from "./ProjectAgentReply";

type FormBlock = Extract<RichUiBlock, { type: "form" }>;
type Answer = { picked: string[]; text: string };

const chip = "rounded-full border px-3 py-1 text-sm transition-colors";
const chipIdle = "border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
const chipOn = "border-orange-500 bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200";
const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-orange-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

/** The message list re-mounts blocks when a new message arrives, so answers and the sent flag live outside the component. */
type Saved = { answers: Answer[]; sent: boolean };
const memory = new Map<string, Saved>();
const saved = {
	get(key: string): Saved | undefined {
		if (memory.has(key)) return memory.get(key);
		try { const raw = window.sessionStorage.getItem(`agent-form:${key}`); return raw ? (JSON.parse(raw) as Saved) : undefined; } catch { return undefined; }
	},
	set(key: string, value: Saved) {
		memory.set(key, value);
		try { window.sessionStorage.setItem(`agent-form:${key}`, JSON.stringify(value)); } catch { /* private mode: memory only */ }
	},
};
const keyOf = (block: FormBlock) => `${block.title ?? ""}|${block.fields.map((field) => field.label).join("|")}`;

const valuesOf = (answer: Answer) => [...answer.picked, ...(answer.text.trim() ? [answer.text.trim()] : [])];

/** A survey card inside the chat: the user fills what they can and sends every answer in one message. */
export function ProjectAgentFormBlock({ block }: { block: FormBlock }) {
	const reply = useContext(ReplyContext);
	const key = keyOf(block);
	const [answers, setAnswersState] = useState<Answer[]>(() => saved.get(key)?.answers ?? block.fields.map(() => ({ picked: [], text: "" })));
	const [sent, setSentState] = useState(() => saved.get(key)?.sent ?? false);
	const setAnswers = (next: (current: Answer[]) => Answer[]) => setAnswersState((current) => { const value = next(current); saved.set(key, { answers: value, sent: saved.get(key)?.sent ?? false }); return value; });
	const setSent = (value: boolean) => { setSentState(value); saved.set(key, { answers, sent: value }); };
	const total = block.fields.length;
	const done = answers.filter((answer) => valuesOf(answer).length > 0).length;

	const update = (index: number, change: Partial<Answer>) => setAnswers((current) => current.map((answer, i) => (i === index ? { ...answer, ...change } : answer)));
	function toggle(index: number, option: string) {
		const field = block.fields[index];
		const current = answers[index].picked;
		const next = field.kind === "multi" ? (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]) : current.includes(option) ? [] : [option];
		update(index, { picked: next, ...(field.kind === "choice" && next.length ? { text: "" } : {}) });
	}
	function send() {
		if (!reply || sent || done === 0) return;
		const lines = block.fields.map((field, index) => ({ field, values: valuesOf(answers[index]) })).filter((row) => row.values.length).map((row) => `- ${row.field.label}: ${row.values.join(", ")}`);
		const skipped = total - done;
		setSent(true);
		reply(`My answers:\n${lines.join("\n")}${skipped ? `\n(${skipped} not answered, use sensible assumptions or ask later only if it changes the advice.)` : ""}`);
	}

	return (
		<div role="group" aria-label={block.title ?? "Survey"} className="not-prose my-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
			<div className="flex items-center justify-between gap-3">
				<p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100"><ClipboardList className="h-4 w-4 text-orange-600" />{block.title ?? "A few questions"}</p>
				<span className="shrink-0 text-xs tabular-nums text-slate-500">{done}/{total} answered</span>
			</div>
			{block.intro ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{block.intro}</p> : null}
			<ol className="mt-3 space-y-4">
				{block.fields.map((field, index) => {
					const answer = answers[index];
					return (
						<li key={`${field.label}-${index}`} className="flex gap-3">
							<span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${valuesOf(answer).length ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{valuesOf(answer).length ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
							<div className="min-w-0 flex-1 space-y-1.5">
								<p className="text-sm font-medium text-slate-900 dark:text-slate-100">{field.label}</p>
								{field.hint ? <p className="text-xs text-slate-500 dark:text-slate-400">{field.hint}</p> : null}
								{field.options.length ? (
									<div className="flex flex-wrap gap-1.5">
										{field.options.map((option) => <button key={option} type="button" disabled={sent} aria-pressed={answer.picked.includes(option)} onClick={() => toggle(index, option)} className={`${chip} ${answer.picked.includes(option) ? chipOn : chipIdle} disabled:cursor-default disabled:opacity-70`}>{option}</button>)}
									</div>
								) : null}
								<input value={answer.text} disabled={sent} onChange={(event) => update(index, { text: event.target.value, ...(field.kind === "choice" && event.target.value ? { picked: [] } : {}) })} placeholder={field.options.length ? "Other (type your own answer)" : field.placeholder ?? "Type your answer"} aria-label={field.label} className={`${inputClass} disabled:opacity-70`} />
							</div>
						</li>
					);
				})}
			</ol>
			<div className="mt-4 flex items-center justify-between gap-3">
				<p className="text-xs text-slate-500">Answer what you can; you can skip the rest.</p>
				<button type="button" onClick={send} disabled={!reply || sent || done === 0} className="rounded-full bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900">{sent ? "Sent" : `${block.submit ?? "Send answers"} (${done}/${total})`}</button>
			</div>
		</div>
	);
}
