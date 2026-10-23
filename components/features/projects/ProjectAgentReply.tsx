"use client";

import { createContext, useContext } from "react";
import { MessageCircleQuestion, Sparkles } from "lucide-react";
import type { RichUiBlock } from "@/lib/project-agent/rich-ui";

type ReplyHandler = ((text: string) => void) | null;
export const ReplyContext = createContext<ReplyHandler>(null);
export const ProjectAgentReplyProvider = ReplyContext.Provider;

const chip = "rounded-full border px-3 py-1.5 text-left text-sm transition-colors";
const chipIdle = "border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
const chipOn = "border-orange-500 bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200";

export function AskBlock({ block }: { block: Extract<RichUiBlock, { type: "ask" }> }) {
	return (
		<div className="not-prose my-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
			<p className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"><MessageCircleQuestion className="h-4 w-4 text-orange-600" />{block.title ?? "Clarifying questions"}</p>
			<ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">{block.questions.map((item, index) => <li key={`${item.question}-${index}`}>{item.question}</li>)}</ol>
		</div>
	);
}

export function FollowupsBlock({ block }: { block: Extract<RichUiBlock, { type: "followups" }> }) {
	const reply = useContext(ReplyContext);
	return (
		<div className="not-prose my-5">
			<p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500"><Sparkles className="h-3.5 w-3.5" />Continue</p>
			<div className="flex flex-col gap-2">
				{block.items.map((item) => (
					<button key={item.label} type="button" disabled={!reply} onClick={() => reply?.(item.prompt)} className={`${chip} ${chipIdle} rounded-xl disabled:cursor-default`}>{item.label}</button>
				))}
			</div>
		</div>
	);
}
