"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, MoreHorizontal } from "lucide-react";
import { usePresentationPortal } from "./presentation-portal";
import "./response-controls.css";

export interface ResponseMoreAction {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  pressed?: boolean;
  keepOpen?: boolean;
}

/** A disclosure, not a pretend backend: callers own every action and its result. */
export function ProjectAgentMoreActions({ label, items, disabled = false, className = "agent-action-button" }: {
  label: string; items: ResponseMoreAction[]; disabled?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<CSSProperties>({});
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const portal = usePresentationPortal();
  useEffect(() => { if (disabled || !items.length) setOpen(false); }, [disabled, items.length]);
  function changeOpen(next: boolean) {
    if (next && (disabled || !items.length)) return;
    if (next && trigger.current) {
      const computed = getComputedStyle(trigger.current);
      const dark = Boolean(trigger.current.closest(".dark"));
      // Preserve a host's nested theme even though the popup lives in a portal.
      const token = (name: string, light: string, night: string) =>
        computed.getPropertyValue(name).trim() || (dark ? night : light);
      setTheme({
        "--agent-more-bg": token("--agent-bg", "#fff", "#2f2f2f"),
        "--agent-more-soft": token("--agent-soft", "#f5f5f5", "#3b3b3b"),
        "--agent-more-text": token("--agent-text", "#202020", "#ececec"),
        "--agent-more-border": token("--agent-border", "#e5e5e5", "#484848"),
        "--agent-more-focus": token("--agent-focus", "#2563eb", "#93c5fd"),
      } as CSSProperties);
    }
    setOpen(next);
  }
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!new Set(["ArrowDown", "ArrowUp", "Home", "End"]).has(event.key)) return;
    const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>(".agent-more-action:not(:disabled)") ?? []);
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
      (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault(); event.stopPropagation(); buttons[next].focus();
  }
  if (!items.length) return null;
  return <Popover.Root open={open} onOpenChange={changeOpen}>
    <Popover.Trigger asChild>
      <button ref={trigger} type="button" className={className} aria-label={label} title={label} disabled={disabled}>
        <MoreHorizontal aria-hidden size={16} />
      </button>
    </Popover.Trigger>
    <Popover.Portal container={portal}>
      <Popover.Content ref={panel} className="agent-more-actions not-prose" style={theme}
        aria-label={label} side="top" align="start" sideOffset={6} collisionPadding={12}
        onOpenAutoFocus={(event) => {
          event.preventDefault(); panel.current?.querySelector<HTMLButtonElement>(".agent-more-action:not(:disabled)")?.focus();
        }} onKeyDown={navigate}>
        {items.map((item) => <button key={item.id} type="button" className="agent-more-action"
          disabled={disabled || item.disabled} aria-pressed={item.pressed} onClick={() => {
            if (!item.keepOpen) setOpen(false);
            item.onSelect();
          }}>
          <span className="agent-more-icon" aria-hidden>{item.icon}</span><span>{item.label}</span>
          {item.pressed !== undefined && <Check aria-hidden className="agent-more-check" data-checked={item.pressed} />}
        </button>)}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
