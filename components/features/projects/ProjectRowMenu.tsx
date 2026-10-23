"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

export interface ProjectRowMenuItem { key: string; label: string; icon: ReactNode; danger?: boolean; separatorBefore?: boolean; onSelect: () => void }

export function ProjectRowMenu({ label, items, alwaysVisible = false }: { label: string; items: ProjectRowMenuItem[]; alwaysVisible?: boolean }) {
	const [open, setOpen] = useState(false);
	const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
	const ref = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (!open) { setPosition(null); return; }
		const rect = buttonRef.current?.getBoundingClientRect();
		if (rect) {
			const up = window.innerHeight - rect.bottom < 340 && rect.top > window.innerHeight - rect.bottom;
			setPosition({ ...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }), left: Math.max(8, Math.min(rect.left, window.innerWidth - 248)) });
		}
		const close = (event: MouseEvent | KeyboardEvent) => {
			if (event instanceof KeyboardEvent) { if (event.key === "Escape") setOpen(false); return; }
			if (!ref.current?.contains(event.target as Node)) setOpen(false);
		};
		const dismiss = () => setOpen(false);
		document.addEventListener("mousedown", close);
		document.addEventListener("keydown", close);
		window.addEventListener("resize", dismiss);
		window.addEventListener("scroll", dismiss, true);
		return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); window.removeEventListener("resize", dismiss); window.removeEventListener("scroll", dismiss, true); };
	}, [open]);
	return (
		<div ref={ref} className="relative shrink-0">
			<button ref={buttonRef} type="button" aria-label={`More actions for ${label}`} aria-haspopup="menu" aria-expanded={open} onClick={(event) => { event.stopPropagation(); setOpen(!open); }} className={`flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:hover:bg-slate-700 ${open || alwaysVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}><MoreHorizontal className="h-4 w-4" /></button>
			{open && position ? (
				<div role="menu" style={position} className="fixed z-50 w-60 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
					{items.map((item) => (
						<div key={item.key}>
							{item.separatorBefore ? <div className="my-1 border-t border-slate-200 dark:border-slate-700" /> : null}
							<button type="button" role="menuitem" onClick={() => { setOpen(false); item.onSelect(); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${item.danger ? "text-red-600" : "text-slate-800 dark:text-slate-100"}`}><span className="shrink-0">{item.icon}</span>{item.label}</button>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}
