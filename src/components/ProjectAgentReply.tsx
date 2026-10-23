"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { RichUiBlock } from "@/lib/project-agent/rich-ui";
import { ProjectAgentResponseContext } from "./ProjectAgentResponseContext";
import { ProjectAgentFormBlock } from "./ProjectAgentFormBlock";
import type { FormBlock } from "./project-agent-form-state";
import { ReplyContext } from "./ProjectAgentReplyContext";
export { ReplyContext, ProjectAgentReplyProvider } from "./ProjectAgentReplyContext";
export type { ReplyHandler } from "./ProjectAgentReplyContext";

export function AskBlock({ block }: { block: Extract<RichUiBlock, { type: "ask" }> }) {
  return <ProjectAgentFormBlock block={{
    type: "form", title: block.title || "Clarifying questions", submit: "Send answers",
    fields: block.questions.map((item): FormBlock["fields"][number] => ({ label: item.question, options: item.options,
      kind: item.options.length ? item.multi ? "multi" : "choice" : "text" })),
  }} />;
}

type Followups = Extract<RichUiBlock, { type: "followups" }>;
export function FollowupsBlock({ block }: { block: Followups }) {
  const scope = useContext(ProjectAgentResponseContext);
  return <FollowupChoices key={JSON.stringify([scope ?? null, block])} block={block} />;
}

function FollowupChoices({ block }: { block: Followups }) {
  const reply = useContext(ReplyContext);
  const [pending, setPending] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const send = async (index: number) => {
    if (!reply || busy.current) return;
    busy.current = true; setPending(index); setStatus("");
    try {
      await reply(block.items[index].prompt);
      if (mounted.current) setStatus("Follow-up sent.");
    } catch {
      if (mounted.current) setStatus("Could not send the follow-up. Please try again.");
    } finally {
      busy.current = false;
      if (mounted.current) setPending(null);
    }
  };
  return <section aria-label="Suggested follow-ups" className="not-prose my-5">
    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500"><Sparkles aria-hidden="true" className="h-3.5 w-3.5" />Continue</p>
    <div className="flex flex-col gap-2">
      {block.items.map((item, index) => <button key={`${item.label}-${index}`} type="button" disabled={!reply || pending !== null}
        onClick={() => void send(index)} aria-busy={pending === index}
        className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-default disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
        {pending === index && <Loader2 aria-hidden="true" size={15} className="shrink-0 animate-spin" />}{item.label}
      </button>)}
    </div>
    <p role="status" aria-live="polite" className="mt-2 text-xs text-slate-500">{status || (!reply ? "Follow-ups are unavailable in this view." : "")}</p>
  </section>;
}
