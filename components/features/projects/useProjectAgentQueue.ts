"use client";

import { useCallback, useRef, useState } from "react";

export interface QueuedMessage { id: string; text: string; files: File[] }

/** Messages typed while the agent is still working: they wait here and are sent one by one when it finishes, or are handed to the running task at once. */
export function useProjectAgentQueue() {
	const [items, setItems] = useState<QueuedMessage[]>([]);
	const counter = useRef(0);
	const enqueue = useCallback((text: string, files: File[]) => setItems((current) => [...current, { id: `queued-${++counter.current}`, text, files }]), []);
	const remove = useCallback((id: string) => setItems((current) => current.filter((item) => item.id !== id)), []);
	const clear = useCallback(() => setItems([]), []);
	return { items, enqueue, remove, clear };
}

/** Quotes a passage the user selected in the conversation above their own question. */
export function withQuote(text: string, quote: string): string {
	const lines = quote.trim().slice(0, 1_500).split(/\r?\n/).map((line) => `> ${line}`).join("\n");
	return `${lines}\n\n${text}`;
}

export interface PickedQuote { text: string; note: string }

/** Passages the user selected (each with an optional comment) in front of the typed question. */
export function withQuotes(text: string, quotes: PickedQuote[]): string {
	const parts = quotes.map((quote) => withQuote(quote.note.trim(), quote.text).trimEnd());
	return [...parts, text].filter(Boolean).join("\n\n");
}
