"use client";

import { useEffect, useRef, useState } from "react";
import { FolderInput, FolderMinus, Files, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from "lucide-react";

export interface ProjectChatMenuProps {
	title: string;
	pinned: boolean;
	canEdit: boolean;
	onRename: () => void;
	onTogglePin: () => void;
	onRemove?: () => void;
	onDelete: () => void;
	onViewFiles?: () => void;
	align?: "left" | "right";
	moveTargets?: Array<{ id: string; name: string }>;
	onMove?: (projectId: string) => void;
}

/** Matches the menu's w-52; keeps it inside a phone-width screen. */
const MENU_WIDTH = 208;

export function ProjectChatMenu({ title, pinned, canEdit, onRename, onTogglePin, onRemove, onDelete, onViewFiles, align = "right", moveTargets = [], onMove }: ProjectChatMenuProps) {
	const [open, setOpen] = useState(false);
	const [pendingMove, setPendingMove] = useState<{ id: string; name: string } | null>(null);
	const ref = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	// The menu is fixed-positioned so scroll containers cannot clip it; it opens upward when there is more room above.
	const [placement, setPlacement] = useState<{ top?: number; bottom?: number; left?: number; right?: number; maxHeight: number } | null>(null);
	useEffect(() => {
		if (!open) { setPendingMove(null); setPlacement(null); return; }
		const rect = buttonRef.current?.getBoundingClientRect();
		if (rect) {
			const below = window.innerHeight - rect.bottom - 12;
			const above = rect.top - 12;
			const up = below < 320 && above > below;
			setPlacement({
				...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
				...(align === "right" ? { right: Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - MENU_WIDTH - 8)) } : { left: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8)) }),
				maxHeight: Math.max(160, up ? above : below),
			});
		}
		const closeOnScroll = (event: Event) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
		window.addEventListener("scroll", closeOnScroll, true);
		window.addEventListener("resize", closeOnScroll);
		const close = (event: MouseEvent | KeyboardEvent) => {
			if (event instanceof KeyboardEvent) { if (event.key === "Escape") setOpen(false); return; }
			if (!ref.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", close);
		document.addEventListener("keydown", close);
		return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); window.removeEventListener("scroll", closeOnScroll, true); window.removeEventListener("resize", closeOnScroll); };
	}, [open]);
	const item = "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800";
	const run = (fn: () => void) => () => { setOpen(false); fn(); };
	return <div ref={ref} className="relative shrink-0">
		<button ref={buttonRef} type="button" aria-label={`Open menu for ${title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={`flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-white hover:text-slate-700 focus-visible:opacity-100 dark:hover:bg-slate-900 ${open ? "opacity-100" : "opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100"}`}><MoreHorizontal className="h-4 w-4" /></button>
		{open && placement && <div role="menu" style={placement} className={`fixed z-50 w-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900`}>
			{canEdit && <button role="menuitem" type="button" className={item} onClick={run(onRename)}><Pencil className="h-4 w-4" />Rename</button>}
			{canEdit && <button role="menuitem" type="button" className={item} onClick={run(onTogglePin)}>{pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}{pinned ? "Unpin chat" : "Pin chat"}</button>}
			{onViewFiles && <button role="menuitem" type="button" className={item} onClick={run(onViewFiles)}><Files className="h-4 w-4" />View files in chat</button>}
			{onRemove && <button role="menuitem" type="button" className={item} onClick={run(onRemove)}><FolderMinus className="h-4 w-4" />Remove from project</button>}
			{onMove && moveTargets.length > 0 && (pendingMove ? <div role="group" aria-label="Confirm move" className="border-t border-slate-100 p-2 dark:border-slate-800"><p className="px-0.5 pb-2 text-sm">Move this chat to <span className="font-medium">{pendingMove.name}</span>? It will no longer appear in this project.</p><div className="flex justify-end gap-2"><button type="button" className="rounded-md px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => setPendingMove(null)}>Cancel</button><button type="button" className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700" onClick={() => { const target = pendingMove; setPendingMove(null); setOpen(false); onMove(target.id); }}>Move</button></div></div> : <div role="group" aria-label="Move to project" className="border-t border-slate-100 py-1 dark:border-slate-800"><p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Move to project</p>{moveTargets.map((target) => <button key={target.id} role="menuitem" type="button" className={item} onClick={() => setPendingMove(target)}><FolderInput className="h-4 w-4 shrink-0" /><span className="truncate">{target.name}</span></button>)}</div>)}
			{canEdit && <button role="menuitem" type="button" className={`${item} text-red-600`} onClick={run(onDelete)}><Trash2 className="h-4 w-4" />Delete chat</button>}
		</div>}
	</div>;
}
