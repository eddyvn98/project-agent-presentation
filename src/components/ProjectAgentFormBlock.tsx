"use client";

import { useContext, useEffect, useId, useRef, useState } from "react";
import { Check, ClipboardList, Copy, Loader2 } from "lucide-react";
import { ReplyContext } from "./ProjectAgentReplyContext";
import { ProjectAgentResponseContext } from "./ProjectAgentResponseContext";
import { usePresentationCopy } from "./presentation-copy";
import { emptyFormAnswer, emptyFormState, FORM_TEXT_LIMIT, formAnswerValues, formSchema,
  loadFormState, saveFormState, type FormAnswer, type FormBlock } from "./project-agent-form-state";

const chip = "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors has-[:disabled]:cursor-default";
const chipIdle = "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
const chipOn = "border-slate-500 bg-slate-100 text-slate-900 dark:border-slate-400 dark:bg-slate-800 dark:text-slate-100";
const inputClass = "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 disabled:opacity-70 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

/** A new response or schema must never inherit another form's draft or sent state. */
export function ProjectAgentFormBlock({ block }: { block: FormBlock }) {
  const scope = useContext(ProjectAgentResponseContext);
  return <ScopedForm key={JSON.stringify([scope ?? null, formSchema(block)])} block={block} scope={scope} />;
}

function ScopedForm({ block: initialBlock, scope }: { block: FormBlock; scope?: string }) {
  // The wrapper's key remounts on semantic changes, not on new object references.
  const block = useRef(initialBlock).current;
  const reply = useContext(ReplyContext);
  const [state, setState] = useState(() => emptyFormState(block));
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const mounted = useRef(false);
  const { copy, status, reset } = usePresentationCopy();
  const id = useId();
  useEffect(() => {
    mounted.current = true;
    setState(loadFormState(scope, block) ?? emptyFormState(block));
    setReady(true);
    return () => { mounted.current = false; };
  }, [scope, block]);
  useEffect(() => { if (ready) saveFormState(scope, block, state); }, [ready, scope, block, state]);
  const { answers, sent } = state;
  const done = answers.filter((answer) => formAnswerValues(answer).length > 0).length;
  const total = block.fields.length;
  const disabled = !ready || sending || sent;
  const update = (index: number, change: Partial<FormAnswer>) => {
    if (disabled || busy.current) return;
    reset(); setError("");
    setState((current) => ({ ...current, answers: current.answers.map((answer, i) => i === index ? { ...answer, ...change } : answer) }));
  };
  function toggle(index: number, option: string) {
    const field = block.fields[index];
    const picked = answers[index].picked;
    update(index, field.kind === "multi"
      ? { picked: picked.includes(option) ? picked.filter((item) => item !== option) : [...picked, option] }
      : { picked: [option], text: "", other: false });
  }
  function summary() {
    const lines = block.fields.flatMap((field, index) => {
      const values = formAnswerValues(answers[index]);
      return values.length ? [`- ${field.label}: ${values.join(", ")}`] : [];
    });
    return `My answers:\n${lines.join("\n")}${total > done ? `\n(${total - done} not answered.)` : ""}`;
  }
  async function send() {
    if (!reply || disabled || !done || busy.current) return;
    busy.current = true; setSending(true); setError("");
    try {
      await reply(summary());
      const confirmed = { answers, sent: true };
      saveFormState(scope, block, confirmed);
      if (mounted.current) setState(confirmed);
    } catch {
      if (mounted.current) setError("Could not send your answers. Your selections remain in this form; please try again.");
    } finally {
      busy.current = false;
      if (mounted.current) setSending(false);
    }
  }
  return <section aria-labelledby={`${id}-title`} aria-busy={!ready || sending} className="not-prose my-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
    <header className="flex items-center justify-between gap-3">
      <h3 id={`${id}-title`} className="!m-0 flex items-center gap-2 !text-sm font-semibold"><ClipboardList aria-hidden="true" size={17} />{block.title || "A few questions"}</h3>
      <span className="shrink-0 text-xs tabular-nums text-slate-500">{done}/{total} answered</span>
    </header>
    {block.intro && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{block.intro}</p>}
    <div className="mt-4 space-y-5">
      {block.fields.map((field, index) => {
        const answer = answers[index];
        const fieldId = `${id}-${index}`;
        return <fieldset key={fieldId} disabled={disabled} aria-describedby={field.hint ? `${fieldId}-hint` : undefined} className="min-w-0 space-y-2">
          <legend className="mb-2 text-sm font-medium">{index + 1}. {field.label}</legend>
          {field.hint && <p id={`${fieldId}-hint`} className="text-xs text-slate-500 dark:text-slate-400">{field.hint}</p>}
          {!!field.options.length && <div className="flex flex-wrap gap-2">
            {Array.from(new Set(field.options)).map((option) => <label key={option} className={`${chip} ${answer.picked.includes(option) ? chipOn : chipIdle}`}>
              <input type={field.kind === "multi" ? "checkbox" : "radio"} name={`${fieldId}-choices`} value={option}
                checked={answer.picked.includes(option)} onChange={() => toggle(index, option)} className="h-4 w-4 shrink-0 accent-slate-700" />{option}
            </label>)}
            {field.kind === "choice" && <label className={`${chip} ${answer.other ? chipOn : chipIdle}`}>
              <input type="radio" name={`${fieldId}-choices`} value="other" checked={answer.other}
                onChange={() => update(index, { picked: [], other: true })} className="h-4 w-4 shrink-0 accent-slate-700" />Other (write your own)
            </label>}
          </div>}
          <label htmlFor={`${fieldId}-text`} className="block text-xs text-slate-500 dark:text-slate-400">{field.options.length ? "Your own answer (optional)" : "Your answer"}</label>
          <input id={`${fieldId}-text`} value={answer.text} maxLength={FORM_TEXT_LIMIT}
            onChange={(event) => update(index, { text: event.target.value.slice(0, FORM_TEXT_LIMIT), ...(field.kind === "choice" ? { picked: [], other: true } : {}) })}
            placeholder={field.placeholder || (field.options.length ? "Type another answer" : "Type your answer")} className={inputClass} />
          {(formAnswerValues(answer).length > 0 || answer.other) && !disabled && <button type="button" onClick={() => update(index, emptyFormAnswer())} className="min-h-8 text-xs text-slate-500 underline underline-offset-4" aria-label={`Clear answer to ${field.label}`}>Clear answer</button>}
        </fieldset>;
      })}
    </div>
    <footer className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-500">Answer what you can; every question is optional.</p>
      {reply ? <button type="button" onClick={() => void send()} disabled={disabled || !done}
        className="inline-flex min-h-10 items-center gap-2 rounded-full bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">
        {sending ? <Loader2 aria-hidden="true" size={15} className="animate-spin" /> : sent ? <Check aria-hidden="true" size={15} /> : null}
        {sending ? "Sending…" : sent ? "Sent" : block.submit || "Send answers"}
      </button> : <button type="button" onClick={() => void copy(summary())} disabled={!ready || !done}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-300 px-4 text-sm disabled:opacity-50 dark:border-slate-600">
        {status === "copied" ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}{status === "copied" ? "Copied" : "Copy answers"}
      </button>}
    </footer>
    <div role="status" aria-live="polite" className="mt-2 text-xs text-slate-500">
      {error || (status === "error" ? "Could not copy. Your answers remain in this form." : sent ? "Your answers were sent." : status === "copied" ? "Answers copied. They have not been sent." : "")}
    </div>
  </section>;
}
