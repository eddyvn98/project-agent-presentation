"use client";

import { useEffect, useId, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref } from "react";
import { ArrowUp, CalendarClock, Check, Globe, Loader2, Mic, Paperclip, Plus, X } from "lucide-react";
import { useAgentComposerStore } from "@/stores/useAgentComposerStore";
import { useDictation } from "./useDictation";
import { ProjectAgentModelPicker } from "./ProjectAgentModelPicker";

type Props = {
	value: string;
	onChange: (value: string) => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	onAttach: () => void;
	/** Files pasted (screenshots) or dropped on the box. */
	onFiles?: (files: File[]) => void;
	placeholder: string;
	ariaLabel: string;
	formRef?: Ref<HTMLFormElement>;
	attachments?: ReactNode;
	/** Rendered under the box on the right, after the model picker, e.g. the context ring. */
	meter?: ReactNode;
	/** Short note shown on phones on the model row, which saves a line under the input. */
	footnote?: string;
	attachLabel?: string;
	sendLabel?: string;
	disabled?: boolean;
	busy?: boolean;
	allowEmptyValue?: boolean;
};

const menuItem = "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800";

export function ProjectAgentComposer({ value, onChange, onSubmit, onAttach, onFiles, placeholder, ariaLabel, formRef, attachments, meter, footnote, attachLabel = "Add files and images", sendLabel = "Send to Project Agent", disabled = false, busy = false, allowEmptyValue = false }: Props) {
	const menuId = useId();
	const menuButtonRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const canSend = !disabled && !busy && (Boolean(value.trim()) || allowEmptyValue);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [expanded, setExpanded] = useState(false);
	const expandedRef = useRef(false);
	useEffect(() => {
		const field = textareaRef.current;
		if (!field) return;
		field.style.height = "auto";
		field.style.height = `${Math.min(field.scrollHeight, 240)}px`;
		// Wraps or has a line break -> actions drop to their own row; stay expanded until the box is emptied (no flicker).
		const next = !value ? false : value.includes("\n") || field.scrollHeight > 52 || expandedRef.current;
		if (next !== expandedRef.current) { expandedRef.current = next; setExpanded(next); }
	}, [value]);

	const { webSearch, setWebSearch } = useAgentComposerStore();
	const [menu, setMenu] = useState<"plus" | null>(null);
	const wrapRef = useRef<HTMLDivElement>(null);
	const valueRef = useRef(value);
	valueRef.current = value;
	const dictation = useDictation((text) => onChange(`${valueRef.current}${valueRef.current && !/\s$/.test(valueRef.current) ? " " : ""}${text}`));
	useEffect(() => {
		if (!menu) return;
		menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
		const closeOnOutsidePointer = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setMenu(null); };
		const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { setMenu(null); menuButtonRef.current?.focus(); } };
		document.addEventListener("pointerdown", closeOnOutsidePointer);
		document.addEventListener("keydown", closeOnEscape);
		return () => {
			document.removeEventListener("pointerdown", closeOnOutsidePointer);
			document.removeEventListener("keydown", closeOnEscape);
		};
	}, [menu]);

	function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
		const pasted = Array.from(event.clipboardData.files);
		if (disabled || !pasted.length || !onFiles) return;
		event.preventDefault();
		const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
		onFiles(pasted.map((file, index) => file.name && file.name !== "image.png" ? file : new File([file], `pasted-${stamp}${pasted.length > 1 ? `-${index + 1}` : ""}.${file.type.split("/")[1] || "png"}`, { type: file.type })));
	}

	function handleDrop(event: DragEvent<HTMLFormElement>) {
		if (disabled || !onFiles || !event.dataTransfer.files.length) return;
		event.preventDefault();
		onFiles(Array.from(event.dataTransfer.files));
	}

	function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
		if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
			event.preventDefault();
			if (canSend) event.currentTarget.form?.requestSubmit();
		}
	}

	return <form ref={formRef} onSubmit={(event) => { if (disabled || busy) { event.preventDefault(); return; } onSubmit(event); }} onDragOver={!disabled && onFiles ? (event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); } : undefined} onDrop={handleDrop} className="mx-auto w-full max-w-3xl">
		<div className="rounded-[28px] border border-slate-300/90 bg-white px-2 py-0.5 sm:px-2.5 sm:py-1.5 shadow-[0_8px_28px_rgba(15,23,42,0.08)] transition focus-within:border-slate-400 focus-within:ring-4 focus-within:ring-slate-900/[0.04] focus-within:shadow-[0_10px_32px_rgba(15,23,42,0.11)] dark:border-slate-700 dark:bg-slate-900 dark:focus-within:border-slate-500 dark:focus-within:ring-white/[0.04]">
			{attachments && <div className="flex flex-wrap gap-2 px-1 pt-2">{attachments}</div>}
			<div ref={wrapRef} className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1">
			<textarea ref={textareaRef} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste} rows={1} maxLength={12000} aria-label={ariaLabel} placeholder={placeholder} disabled={disabled} className={`max-h-60 min-h-11 w-full resize-none border-0 bg-transparent px-3 py-2.5 text-[15px] leading-6 text-slate-900 !outline-none focus:!outline-none focus-visible:!outline-none focus-visible:!ring-0 placeholder:text-slate-400 disabled:opacity-60 dark:text-slate-100 dark:placeholder:text-slate-500 ${expanded ? "col-span-3 row-start-1" : "col-start-2 row-start-1"}`} />
				<div className={`flex min-w-0 items-center gap-2 col-start-1 ${expanded ? "row-start-2" : "row-start-1"}`}>
					<button ref={menuButtonRef} type="button" aria-controls={menu === "plus" ? menuId : undefined} onClick={() => setMenu(menu === "plus" ? null : "plus")} disabled={disabled} aria-label="Add to message" aria-haspopup="menu" aria-expanded={menu === "plus"} title="Add to message" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"><Plus className="h-5 w-5" /></button>
					{webSearch ? <button type="button" onClick={() => setWebSearch(false)} aria-label="Turn off web search" className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1.5 text-[13px] font-medium text-sky-700 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300"><Globe className="h-4 w-4" />Search<X className="h-3.5 w-3.5" /></button> : null}
				</div>
				<div className={`flex shrink-0 items-center gap-1 col-start-3 ${expanded ? "row-start-2" : "row-start-1"}`}>
					{dictation.supported ? <button type="button" onClick={dictation.toggle} disabled={disabled} aria-label={dictation.listening ? "Stop dictation" : "Dictate"} aria-pressed={dictation.listening} title={dictation.listening ? "Stop dictation" : "Dictate"} className={`flex h-9 w-9 items-center justify-center rounded-full transition ${dictation.listening ? "animate-pulse bg-red-50 text-red-600 dark:bg-red-950/40" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}><Mic className="h-5 w-5" /></button> : null}
					<button type="submit" aria-label={sendLabel} disabled={!canSend} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 dark:disabled:bg-slate-700 dark:disabled:text-slate-500">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-5 w-5" />}</button>
				</div>
				{menu === "plus" ? <div ref={menuRef} id={menuId} role="menu" aria-label="Message options" onKeyDown={(event) => {
					if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
					event.preventDefault();
					const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
					const at = items.indexOf(document.activeElement as HTMLButtonElement);
					items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
				}} className="absolute bottom-full left-0 z-30 mb-2 w-72 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
					<button type="button" role="menuitem" onClick={() => { setMenu(null); onAttach(); menuButtonRef.current?.focus(); }} className={menuItem}><Paperclip className="h-4 w-4 text-slate-500" /><span>{attachLabel}</span><span className="ml-auto text-xs text-slate-400">Photos, screenshots, documents</span></button>
					<button type="button" role="menuitem" onClick={() => { window.location.href = "/account/scheduled-tasks"; }} className={menuItem}><CalendarClock className="h-4 w-4 text-orange-500" /><span>Scheduled tasks</span></button>
          <button type="button" role="menuitemcheckbox" aria-checked={webSearch} onClick={() => { setWebSearch(!webSearch); setMenu(null); menuButtonRef.current?.focus(); }} className={menuItem}><Globe className="h-4 w-4 text-sky-500" /><span>Web search</span><span className="ml-auto text-xs text-slate-400">Find current info</span>{webSearch ? <Check className="h-4 w-4" /> : null}</button>
				</div> : null}
			</div>
		</div>
		<div className="mt-0 flex items-center justify-end gap-1.5 px-3 sm:mt-1">
			{footnote ? <span className="mr-auto min-w-0 truncate text-[10px] text-slate-400 sm:hidden">{footnote}</span> : null}
			<ProjectAgentModelPicker />
			{meter}
		</div>
	</form>;
}
