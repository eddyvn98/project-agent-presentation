"use client";

import { CornerDownLeft, MessageSquareQuote, Wand2 } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

type Props = { containerRef: RefObject<HTMLElement | null>; onQuote: (text: string, note: string) => void; onRevise?: (text: string, instruction: string, title: string) => void };

/** Text selected in the conversation shows a small Reply button (so the selection can still be copied); Reply opens a box where Enter attaches the passage (and the comment) to the message box without sending. */
export function ProjectAgentSelectionAsk({ containerRef, onQuote, onRevise }: Props) {
	const [pick, setPick] = useState<{ text: string; x: number; y: number; draft?: string } | null>(null);
	const [note, setNote] = useState("");
	const [open, setOpen] = useState(false);
	const boxRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (!pick || !open) return;
		const frame = window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
		return () => window.cancelAnimationFrame(frame);
	}, [pick, open]);
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const read = () => {
			const selection = window.getSelection();
			const text = selection?.toString().trim() ?? "";
			if (!selection || selection.isCollapsed || text.length < 3 || !container.contains(selection.anchorNode) || !container.contains(selection.focusNode)) return;
			const rect = selection.getRangeAt(0).getBoundingClientRect();
			setNote("");
			setOpen(false);
			const card = (selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement)?.closest("[data-writing-title]");
			setPick({ text, draft: card ? card.getAttribute("data-writing-title") ?? "" : undefined, x: Math.min(Math.max(rect.left + rect.width / 2, 170), window.innerWidth - 170), y: Math.max(rect.top - 8, 64) });
		};
		const later = () => window.setTimeout(read, 0);
		const clear = () => setPick(null);
		const outside = (event: MouseEvent) => { if (!boxRef.current?.contains(event.target as Node)) setPick(null); };
		container.addEventListener("mouseup", later);
		container.addEventListener("keyup", later);
		container.addEventListener("scroll", clear, { passive: true });
		document.addEventListener("mousedown", outside);
		return () => { container.removeEventListener("mouseup", later); container.removeEventListener("keyup", later); container.removeEventListener("scroll", clear); document.removeEventListener("mousedown", outside); };
	}, [containerRef]);
	if (!pick) return null;
	const revise = () => { if (onRevise && pick?.draft !== undefined && note.trim()) { onRevise(pick.text, note.trim(), pick.draft); setPick(null); window.getSelection()?.removeAllRanges(); } };
	const attach = () => { onQuote(pick.text, note); setPick(null); window.getSelection()?.removeAllRanges(); };
	if (!open) return <div ref={boxRef} style={{ left: pick.x, top: pick.y }} className="fixed z-50 -translate-x-1/2 -translate-y-full">
		<button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen(true)} aria-label="Reply" title="Reply to the selected text" className="flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-lg hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"><MessageSquareQuote className="h-3.5 w-3.5" />Reply</button>
	</div>;
	return <div ref={boxRef} style={{ left: pick.x, top: pick.y }} className="fixed z-50 w-80 -translate-x-1/2 -translate-y-full rounded-2xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
		<div className="flex items-center gap-2 px-3 pb-0.5 pt-1.5 text-xs text-slate-500 dark:text-slate-400"><MessageSquareQuote className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{pick.text.replace(/\s+/g, " ")}</span></div>
		<div className="flex items-center gap-1 pl-3">
			<input ref={inputRef} value={note} onChange={(event) => setNote(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); attach(); } else if (event.key === "Escape") setPick(null); }} placeholder="Reply to this… (Enter to attach)" aria-label="Reply to the selected text" className="min-w-0 flex-1 border-0 bg-transparent py-1.5 text-sm text-slate-900 !outline-none placeholder:text-slate-400 focus:!outline-none focus:!ring-0 dark:text-slate-100" />
			{onRevise && pick.draft !== undefined && <button type="button" onClick={revise} disabled={!note.trim()} aria-label="Revise this passage" title="Revise this passage (describe the change first)" className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-slate-200 px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Wand2 className="h-3.5 w-3.5" />Revise</button>}
			<button type="button" onClick={attach} aria-label="Attach the selected text to the message" title="Attach to message" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"><CornerDownLeft className="h-4 w-4" /></button>
		</div>
	</div>;
}
