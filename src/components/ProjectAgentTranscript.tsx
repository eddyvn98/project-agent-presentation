"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import "./conversation-presentation.css";

export interface ProjectAgentTranscriptProps {
  children: ReactNode;
  className?: string;
  label?: string;
  /** Change when opening another conversation. Existing content is never rewritten. */
  conversationKey?: string;
}

/** Follow new output only while the reader is at the bottom; never steal scroll or focus. */
export function ProjectAgentTranscript({ children, className = "", label = "Conversation", conversationKey }: ProjectAgentTranscriptProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const frame = useRef<number | null>(null);
  const [jump, setJump] = useState(false);
  const sync = useCallback(() => {
    const node = viewport.current;
    if (!node) return;
    following.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    setJump(!following.current);
  }, []);
  const update = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const node = viewport.current;
      if (!node) return;
      if (following.current) { node.scrollTop = node.scrollHeight; setJump(false); }
      else setJump(node.scrollHeight - node.scrollTop - node.clientHeight >= 80);
    });
  }, []);
  useEffect(() => { following.current = true; setJump(false); update(); }, [conversationKey, update]);
  useEffect(update, [children, update]);
  useEffect(() => {
    const node = content.current;
    if (!node) return;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(node);
    if (viewport.current) observer?.observe(viewport.current);
    window.addEventListener("resize", update);
    node.addEventListener("load", update, true);
    return () => {
      observer?.disconnect(); window.removeEventListener("resize", update); node.removeEventListener("load", update, true);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [update]);
  return <div className={`agent-transcript ${className}`}>
    <div ref={viewport} className="agent-transcript-scroll" role="region" aria-label={label} tabIndex={0} onScroll={sync}>
      <div ref={content} className="agent-transcript-content">{children}</div>
    </div>
    {jump && <button type="button" className="agent-jump-latest" onClick={() => {
      const node = viewport.current;
      if (!node) return;
      following.current = true;
      node.focus({ preventScroll: true });
      // Immediate movement avoids competing with the next streamed chunk's resize.
      node.scrollTo({ top: node.scrollHeight, behavior: "auto" }); setJump(false);
    }}><ArrowDown aria-hidden />Jump to latest</button>}
  </div>;
}
