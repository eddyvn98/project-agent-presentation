"use client";

import { CornerDownRight, ListPlus, X } from "lucide-react";
import type { QueuedMessage } from "./useProjectAgentQueue";

type Props = {
	items: QueuedMessage[];
	/** The running task can take an added message right now. */
	canSteer: boolean;
	onSteer: (item: QueuedMessage) => void;
	onRemove: (id: string) => void;
};

/** Messages waiting for the agent to finish; "Add now" hands one to the running task instead of waiting. */
export function ProjectAgentQueue({ items, canSteer, onSteer, onRemove }: Props) {
	if (!items.length) return null;
	return <ul aria-label="Queued messages" className="mx-auto mb-2 flex w-full max-w-3xl flex-col gap-1.5">
		{items.map((item) => <li key={item.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
			<ListPlus className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
			<span className="min-w-0 flex-1 truncate" title={item.text}>{item.text.replace(/\s+/g, " ")}{item.files.length ? ` · ${item.files.length} file${item.files.length === 1 ? "" : "s"}` : ""}</span>
			<span className="hidden shrink-0 text-xs text-slate-400 sm:inline">Sends when the agent finishes</span>
			<button type="button" onClick={() => onSteer(item)} disabled={!canSteer || item.files.length > 0} title={item.files.length ? "Messages with files wait for the agent to finish" : "Give this to the agent now, while it works"} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-white disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"><CornerDownRight className="h-3.5 w-3.5" />Add now</button>
			<button type="button" onClick={() => onRemove(item.id)} aria-label="Remove queued message" className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"><X className="h-3.5 w-3.5" /></button>
		</li>)}
	</ul>;
}
