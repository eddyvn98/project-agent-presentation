"use client";

import { useState } from "react";
import type { RichUiBlock } from "@/lib/project-agent/rich-ui";
import { responseLabels } from "../../shared/project-agent/response-locale";

type QuizBlock = Extract<RichUiBlock, { type: "quiz" }>;
export function ProjectAgentQuiz({ block, language = "en" }: { block: QuizBlock; language?: string }) {
  const labels = responseLabels(language);
  const [selection, setSelection] = useState<number | null>(null);
  const correct = selection === block.answerIndex;
  return <section className="not-prose my-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-label={block.title || labels.quizTitle}>
    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{block.title || labels.quizTitle}</h3>
    <p className="mt-2 text-sm leading-6 text-slate-900 dark:text-slate-100">{block.question}</p>
    <div className="mt-3 grid gap-2" role="group" aria-label={labels.chooseAnswer}>
      {block.options.map((option, index) => <button key={index} type="button"
        aria-pressed={selection === index} onClick={() => setSelection(index)}
        className={`min-h-10 rounded-lg border px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600 ${selection === index ? "border-orange-500 bg-orange-50 text-slate-900" : "border-slate-200 text-slate-800 dark:border-slate-700 dark:text-slate-200"}`}>
        {index + 1}. {option}
      </button>)}
    </div>
    {selection !== null && <div role="status" className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-200">
      <p className="font-semibold">{correct ? labels.correct : labels.tryAgain}</p>
      {block.explanation && <p className="mt-1 leading-6">{block.explanation}</p>}
    </div>}
  </section>;
}
