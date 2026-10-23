"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Globe2 } from "lucide-react";

type ProjectAgentSourceLinkProps = {
	href: string;
	host: string;
	label: string;
	title: string;
};

export function ProjectAgentSourceLink({ href, host, label, title }: ProjectAgentSourceLinkProps) {
	const [faviconFailed, setFaviconFailed] = useState(false);
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLSpanElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const popoverId = useId();
	const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 16 });
	const faviconUrl = new URL("/favicon.ico", href).toString();
	const togglePopover = () => {
		if (!open) {
			const rect = triggerRef.current?.getBoundingClientRect();
			if (rect) setPopoverPosition({
				top: rect.bottom + 8,
				left: Math.max(16, Math.min(rect.left, window.innerWidth - 304)),
			});
		}
		setOpen((value) => !value);
	};

	useEffect(() => {
		if (!open) return;
		const updatePosition = () => {
			const anchor = triggerRef.current?.getBoundingClientRect();
			const popover = popoverRef.current;
			if (!anchor || !popover) return;
			const width = Math.min(288, window.innerWidth - 24);
			const height = popover.getBoundingClientRect().height;
			const below = anchor.bottom + 8;
			const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - height - 8);
			const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
			setPopoverPosition({ top, left });
		};
		const frame = window.requestAnimationFrame(() => {
			updatePosition();
			popoverRef.current?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
		});
		const closeOnOutsidePointer = (event: PointerEvent) => {
			const target = event.target as Node;
			if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
			setOpen(false);
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			setOpen(false);
			triggerRef.current?.focus();
		};
		document.addEventListener("pointerdown", closeOnOutsidePointer);
		document.addEventListener("keydown", closeOnEscape);
		window.addEventListener("resize", updatePosition);
		window.addEventListener("scroll", updatePosition, true);
		return () => {
			window.cancelAnimationFrame(frame);
			document.removeEventListener("pointerdown", closeOnOutsidePointer);
			document.removeEventListener("keydown", closeOnEscape);
			window.removeEventListener("resize", updatePosition);
			window.removeEventListener("scroll", updatePosition, true);
		};
	}, [open]);

	return (
		<span ref={rootRef} className="not-prose group relative mx-0.5 inline-block align-baseline text-left">
			<button
				type="button"
				ref={triggerRef}
				aria-expanded={open}
				aria-controls={popoverId}
				aria-haspopup="dialog"
				aria-label={`Show source: ${title} (${host})`}
				className="inline-flex max-w-[14rem] cursor-pointer items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 align-baseline text-[11px] font-medium leading-4 text-slate-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-orange-500/60 dark:hover:bg-orange-950/30"
				onClick={togglePopover}
			>
				{faviconFailed ? <Globe2 aria-hidden="true" className="h-3 w-3 shrink-0 text-slate-400" /> : (
					<Image
						alt=""
						aria-hidden="true"
						className="h-3 w-3 shrink-0 rounded-sm object-contain"
						height={12}
						loading="lazy"
						referrerPolicy="no-referrer"
						src={faviconUrl}
						unoptimized
						width={12}
						onError={() => setFaviconFailed(true)}
					/>
				)}
				<span className="truncate">{label}</span>
			</button>
			{open && typeof document !== "undefined" && createPortal(<div ref={popoverRef} id={popoverId} role="dialog" aria-label={`Source details: ${title}`} style={{ position: "fixed", top: popoverPosition.top, left: popoverPosition.left, maxHeight: "calc(100dvh - 16px)" }} className="z-[100] w-72 max-w-[calc(100vw-1.5rem)] overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl dark:border-slate-700 dark:bg-slate-900">
				<p className="text-xs font-semibold leading-5 text-slate-800 dark:text-slate-100">{title}</p>
				<p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{host}</p>
				<a
					href={href}
					target="_blank"
					rel="noopener noreferrer"
					className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 no-underline hover:bg-orange-50 hover:text-orange-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-orange-950/40 dark:hover:text-orange-300"
				>
					Open source <ExternalLink aria-hidden="true" className="h-3 w-3" />
				</a>
			</div>, document.body)}
		</span>
	);
}
