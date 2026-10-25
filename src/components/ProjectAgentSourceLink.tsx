"use client";

import { useRef } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ExternalLink, Globe2, X } from "lucide-react";
import { safePresentationUrl } from "./ProjectAgentFigure";

type ProjectAgentSourceLinkProps = { href: string; host: string; label: string; title: string };

export function ProjectAgentSourceLink({ href, host, label, title }: ProjectAgentSourceLinkProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Keyboard activation can reopen after focus is restored while layout/scroll
  // has moved the trigger outside the viewport. Position the popup only after
  // bringing its anchor back into view; never focus popup children with scrolling.
  const revealTrigger = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    if (rect.top < 12 || rect.bottom > window.innerHeight - 12)
      trigger.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  };
  const restoreTrigger = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    trigger.focus({ preventScroll: true });
    revealTrigger();
    // Radix unmount/focus-scope cleanup can finish after onCloseAutoFocus.
    // Recheck after one and two paints, not after a fixed sleep. Stop if the
    // user changed focus, reopened the popover, or navigated away.
    requestAnimationFrame(() => {
      if (!trigger.isConnected || document.activeElement !== trigger) return;
      revealTrigger();
      requestAnimationFrame(() => {
        if (trigger.isConnected && document.activeElement === trigger) revealTrigger();
      });
    });
  };
  if (!safePresentationUrl(href) || !/^https?:\/\//i.test(href)) return <span>{label}</span>;
  return <Popover.Root onOpenChange={(open) => { if (open) revealTrigger(); }}>
    <Popover.Trigger asChild><button ref={triggerRef} type="button" aria-label={`Show source: ${title} (${host})`}
      className="not-prose mx-0.5 inline-flex min-h-6 max-w-[14rem] items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 align-baseline text-xs leading-5 text-slate-600 focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
      <Globe2 aria-hidden className="h-3 w-3 shrink-0" /><span className="truncate">{label}</span>
    </button></Popover.Trigger>
    <Popover.Portal><Popover.Content sideOffset={6} collisionPadding={12} onOpenAutoFocus={(event) => { event.preventDefault(); revealTrigger(); linkRef.current?.focus({ preventScroll: true }); }} onCloseAutoFocus={(event) => { event.preventDefault(); restoreTrigger(); }} aria-label={`Source details: ${title}`}
      className="relative z-[100] w-72 max-w-[calc(100vw-1.5rem)] overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900"
      style={{ maxHeight: "var(--radix-popover-content-available-height)", overflowWrap: "anywhere" }}>
      <p className="pr-7 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{host}</p>
      <a ref={linkRef} href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-10 items-center gap-2 rounded px-2 text-sm text-orange-700 underline dark:text-orange-300">
        Open source <ExternalLink aria-hidden className="h-3 w-3" />
      </a>
      <Popover.Close aria-label="Close source details" className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded focus-visible:ring-2"><X aria-hidden className="h-4 w-4" /></Popover.Close>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
