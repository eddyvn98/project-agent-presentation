"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bookmark, Check, Copy, GitBranch, Loader2, RotateCcw, Share2, ThumbsDown, ThumbsUp, Volume2 } from "lucide-react";
import { usePresentationCopy } from "./presentation-copy";

type Action = () => void | Promise<void>;
export type AnswerFeedback = "up" | "down" | null;
export type AnswerActionHandlers = {
  /** Built-in copy uses the original Markdown unless the host supplies exact text. */
  copyText?: string;
  onRetry?: Action;
  onBranch?: Action;
  onSave?: Action;
  onShare?: Action;
  onReadAloud?: Action;
  onFeedback?: (feedback: AnswerFeedback) => void | Promise<void>;
  feedback?: AnswerFeedback;
};

export function ProjectAgentActionButton({ label, children, onClick, disabled, pressed }: {
  label: string; children: ReactNode; onClick: () => void; disabled?: boolean; pressed?: boolean;
}) {
  return <button type="button" className="agent-action-button" aria-label={label} title={label}
    disabled={disabled} aria-pressed={pressed} onClick={onClick}>{children}</button>;
}

/** Only the copy action is built in. Every external effect needs a host callback. */
export function ProjectAgentAnswerActions({ markdown, handlers = {}, disabled = false }: {
  markdown: string; handlers?: AnswerActionHandlers; disabled?: boolean;
}) {
  const { copy, status, reset } = usePresentationCopy();
  const copyText = handlers.copyText ?? markdown;
  const source = useRef({ markdown, copyText, revision: 0 });
  if (source.current.markdown !== markdown || source.current.copyText !== copyText) {
    source.current = { markdown, copyText, revision: source.current.revision + 1 };
  }
  const revision = source.current.revision;
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState<AnswerFeedback>(handlers.feedback ?? null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const request = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current += 1; }; }, []);
  useEffect(reset, [copyText, reset]);
  useEffect(() => { setFeedback(handlers.feedback ?? null); }, [handlers.feedback, revision]);
  useEffect(() => {
    request.current += 1; locked.current = false; setPending(null); setMessage("");
  }, [revision]);
  async function run(label: string, action: Action, done?: () => void) {
    if (locked.current || disabled) return;
    locked.current = true; setPending(label); setMessage("");
    const operation = ++request.current;
    const sourceRevision = source.current.revision;
    const isCurrent = () => mounted.current && request.current === operation && source.current.revision === sourceRevision;
    try {
      await action();
      if (isCurrent()) { done?.(); setMessage(`${label} completed`); }
    } catch (error) {
      if (isCurrent()) setMessage(error instanceof Error && error.message ? error.message : `${label} failed. Please try again.`);
    } finally {
      if (isCurrent()) { locked.current = false; setPending(null); }
    }
  }
  const busy = disabled || pending !== null;
  const vote = (value: Exclude<AnswerFeedback, null>) => {
    const next = feedback === value ? null : value;
    if (handlers.onFeedback) void run("Feedback", () => handlers.onFeedback!(next), () => setFeedback(next));
  };
  const optional = [
    { label: "Read aloud", action: handlers.onReadAloud, Icon: Volume2 },
    { label: "Regenerate response", action: handlers.onRetry, Icon: RotateCcw },
    { label: "Branch from this response", action: handlers.onBranch, Icon: GitBranch },
    { label: "Save response", action: handlers.onSave, Icon: Bookmark },
    { label: "Share response", action: handlers.onShare, Icon: Share2 },
  ];
  return <div className="agent-answer-actions not-prose" role="group" aria-label="Response actions" data-agent-control>
    <ProjectAgentActionButton label={status === "copied" ? "Copied" : "Copy response"}
      disabled={disabled || !copyText.trim()} onClick={() => { setMessage(""); void copy(copyText); }}>
      {status === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
    </ProjectAgentActionButton>
    {handlers.onFeedback && <>
      <ProjectAgentActionButton label="Good response" pressed={feedback === "up"} disabled={busy} onClick={() => vote("up")}><ThumbsUp aria-hidden /></ProjectAgentActionButton>
      <ProjectAgentActionButton label="Bad response" pressed={feedback === "down"} disabled={busy} onClick={() => vote("down")}><ThumbsDown aria-hidden /></ProjectAgentActionButton>
    </>}
    {optional.map(({ label, action, Icon }) => action && <ProjectAgentActionButton key={label}
      label={label} disabled={busy} onClick={() => void run(label, action)}>
      {pending === label ? <Loader2 aria-hidden className="agent-status-spinner" /> : <Icon aria-hidden />}
    </ProjectAgentActionButton>)}
    <span className="agent-action-feedback" role="status" aria-live="polite">{message ||
      (status === "copied" ? "Copied" : status === "error" ? "Copy failed. Select the text and copy it manually." : "")}</span>
  </div>;
}
