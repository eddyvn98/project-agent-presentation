"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ExternalLink, Globe2, X } from "lucide-react";
import { presentationSourceDate, presentationSourceUrl } from "./presentation-source-utils";
import { usePresentationPortal } from "./presentation-portal";
import "./presentation-visuals.css";

export type ProjectAgentSourceLinkProps = { href: string; host: string; label: string; title: string; excerpt?: string; publishedAt?: string };

export function ProjectAgentSourceLink({ href, label, title, excerpt, publishedAt }: ProjectAgentSourceLinkProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);
  const mode = useRef<"hover" | "pinned" | null>(null);
  const restoreFocus = useRef(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimers = useCallback(() => {
    if (openTimer.current !== null) clearTimeout(openTimer.current);
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);
  useEffect(() => {
    clearTimers();
    mode.current = null;
    restoreFocus.current = false;
    setOpen(false);
    return clearTimers;
  }, [href, clearTimers]);
  const portal = usePresentationPortal();
  function changeOpen(next: boolean) {
    clearTimers();
    if (next) {
      mode.current = "pinned";
      restoreFocus.current = true;
    } else {
      restoreFocus.current = mode.current === "pinned";
      mode.current = null;
    }
    setOpen(next);
  }
  function enterTrigger(pointerType: string) {
    if (pointerType !== "mouse") return;
    clearTimers();
    if (mode.current !== null) return;
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      mode.current = "hover";
      restoreFocus.current = false;
      setOpen(true);
    }, 250);
  }
  function leave(pointerType: string) {
    if (pointerType !== "mouse") return;
    clearTimers();
    if (mode.current !== "hover") return;
    // The grace period lets the pointer cross the small trigger/popover gap.
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      if (mode.current === "hover") changeOpen(false);
    }, 180);
  }
  const url = presentationSourceUrl(href);
  if (!url) return <span>{label}</span>;
  const host = url.hostname.replace(/^www\./, "");
  const sourceTitle = title?.trim() || host;
  const date = presentationSourceDate(publishedAt);
  return <Popover.Root open={open} onOpenChange={changeOpen}>
    <Popover.Trigger asChild><button type="button" aria-label={`Show source: ${sourceTitle} (${host})`}
      className="agent-source-chip not-prose"
      onPointerEnter={(event) => enterTrigger(event.pointerType)}
      onPointerLeave={(event) => leave(event.pointerType)}
      onClick={(event) => {
        clearTimers();
        if (mode.current !== "hover") return;
        // Radix normally toggles an open trigger closed; a preview click pins it instead.
        event.preventDefault();
        changeOpen(true);
        linkRef.current?.focus();
      }}>
      <Globe2 aria-hidden className="h-3 w-3 shrink-0" /><span className="truncate">{label || host}</span>
    </button></Popover.Trigger>
    <Popover.Portal container={portal}>
      <Popover.Content side="top" align="start" sideOffset={8} collisionPadding={12}
      onOpenAutoFocus={(event) => { event.preventDefault(); if (mode.current === "pinned") linkRef.current?.focus(); }}
      onCloseAutoFocus={(event) => { if (!restoreFocus.current) event.preventDefault(); }}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") clearTimers(); }}
      onPointerLeave={(event) => leave(event.pointerType)}
      onFocusCapture={() => {
        // Once a reader tabs/clicks into the preview, keep it available for interaction.
        clearTimers();
        mode.current = "pinned";
        restoreFocus.current = true;
      }}
      aria-label={`Source details: ${sourceTitle}`} className="agent-source-popover not-prose">
      <p className="agent-source-popover-title">{sourceTitle}</p>
      <p className="agent-source-meta">{host}{date && <> · Published: <time dateTime={date}>{date}</time></>}</p>
      {excerpt && <blockquote className="agent-source-popover-excerpt" tabIndex={0} aria-label="Source excerpt">{excerpt}</blockquote>}
      <a ref={linkRef} href={href} target="_blank" rel="noopener noreferrer" className="agent-source-open">
        Open source <ExternalLink aria-hidden className="h-3 w-3" />
      </a>
      <Popover.Close aria-label="Close source details" className="agent-source-close"><X aria-hidden className="h-4 w-4" /></Popover.Close>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
