"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Loader2, Pencil } from "lucide-react";
import { ProjectAgentAnswer, type ProjectAgentAnswerProps } from "./ProjectAgentAnswer";
import { ProjectAgentActionButton, type AnswerActionHandlers } from "./ProjectAgentAnswerActions";
import { usePresentationCopy } from "./presentation-copy";
import "./conversation-presentation.css";

export type MessageVariants = {
  /** Zero-based active variant; changing it is entirely host controlled. */
  index: number;
  count: number;
  onChange: (index: number) => void | Promise<void>;
};
export interface ProjectAgentMessageProps extends Omit<ProjectAgentAnswerProps, "id" | "actions" | "className"> {
  messageId: string;
  role: "assistant" | "user";
  name?: string;
  meta?: ReactNode;
  attachments?: ReactNode;
  beforeAnswer?: ReactNode;
  className?: string;
  actions?: boolean | AnswerActionHandlers;
  onEdit?: (markdown: string) => void | Promise<void>;
  variants?: MessageVariants;
}

/** A reusable message surface. It never owns a model, conversation, or request history. */
export function ProjectAgentMessage(props: ProjectAgentMessageProps) {
  return <MessageSurface key={JSON.stringify([props.messageId, props.role])} {...props} />;
}

type MessageOperation = {
  kind: "edit" | "variant";
  revision: number;
  variant: number | undefined;
  draft?: string;
};

function MessageSurface({ messageId, role, name, meta, attachments, beforeAnswer,
  className = "", actions = true, onEdit, variants, markdown, ...answer }: ProjectAgentMessageProps) {
  const inputId = useId();
  const editTrigger = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(markdown);
  const [editRevision, setEditRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<MessageOperation | null>(null);
  const mounted = useRef(true);
  const focusFrame = useRef<number | null>(null);
  const source = useRef({ markdown, variant: variants?.index, revision: 0 });
  if (source.current.markdown !== markdown || source.current.variant !== variants?.index) {
    source.current = { markdown, variant: variants?.index, revision: source.current.revision + 1 };
  }
  const revision = source.current.revision;
  const { copy, status, reset } = usePresentationCopy();
  const displayName = name || (role === "user" ? "You" : "Assistant");
  const streaming = answer.status ? answer.status === "streaming" : !!answer.streaming;
  const isCurrent = useCallback((operation: MessageOperation) => mounted.current && pending.current === operation &&
    (operation.revision === source.current.revision || (operation.kind === "edit" &&
      source.current.revision === operation.revision + 1 && source.current.markdown === operation.draft &&
      source.current.variant === operation.variant)), []);
  const sourceChanged = editing && editRevision !== revision && !(pending.current?.kind === "edit" && isCurrent(pending.current));
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; pending.current = null;
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    };
  }, []);
  useEffect(reset, [markdown, reset]);
  useEffect(() => {
    // A host may publish the saved text before its save promise resolves.
    const operation = pending.current;
    if (operation && isCurrent(operation)) return;
    pending.current = null; setBusy(false); setError("");
  }, [revision, isCurrent]);
  const closeEditor = () => {
    setEditing(false);
    const currentRevision = source.current.revision;
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      if (mounted.current && source.current.revision === currentRevision) editTrigger.current?.focus({ preventScroll: true });
    });
  };
  const begin = (kind: MessageOperation["kind"], nextDraft?: string) => {
    const operation = { kind, revision: source.current.revision, variant: source.current.variant, draft: nextDraft };
    pending.current = operation; setBusy(true); setError("");
    return operation;
  };
  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!onEdit || !draft.trim() || draft === markdown || sourceChanged || streaming || pending.current) return;
    const operation = begin("edit", draft);
    try { await onEdit(draft); if (isCurrent(operation)) closeEditor(); }
    catch (reason) {
      if (isCurrent(operation)) setError(reason instanceof Error && reason.message ? reason.message : "Could not save this edit. Try again.");
    } finally {
      if (isCurrent(operation)) { pending.current = null; setBusy(false); }
    }
  }
  async function switchVariant(next: number) {
    if (!variants || pending.current || streaming || editing || !Number.isInteger(next) ||
      next < 0 || next >= variants.count || next === variants.index) return;
    const operation = begin("variant");
    try { await variants.onChange(next); }
    catch { if (isCurrent(operation)) setError("Could not change response. Please try again."); }
    finally { if (isCurrent(operation)) { pending.current = null; setBusy(false); } }
  }
  const validVariants = variants && Number.isInteger(variants.count) && Number.isInteger(variants.index) &&
    variants.count > 0 && variants.index >= 0 && variants.index < variants.count;
  const hasVariants = validVariants && variants && variants.count > 1;
  const answerId = validVariants && variants ? `${messageId}-answer-v${variants.index}` : `${messageId}-answer`;
  return <article className={`agent-message agent-message--${role} ${className}`}
    data-message-id={messageId} aria-label={`${displayName} message`}>
    {(name || meta) && <header className="agent-message-header"><span>{displayName}</span>{meta}</header>}
    {beforeAnswer}
    {editing ? <form className="agent-message-editor" onSubmit={submitEdit} aria-busy={busy}>
      <label htmlFor={inputId}>Edit message</label>
      <textarea id={inputId} autoFocus value={draft} disabled={busy} aria-describedby={sourceChanged ? `${inputId}-changed` : undefined}
        rows={Math.min(12, Math.max(3, draft.split("\n").length))}
        onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape" && !busy) { event.preventDefault(); closeEditor(); }
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
        }} />
      {sourceChanged && <p id={`${inputId}-changed`} role="status">This message changed while you were editing. Your draft is preserved. Copy it before cancelling, then reopen the editor to edit the latest message.</p>}
      <div className="agent-message-edit-actions">
        <button type="button" disabled={busy} onClick={closeEditor}>Cancel</button>
        <button type="submit" disabled={busy || streaming || sourceChanged || !draft.trim() || draft === markdown}>{busy ? "Saving…" : "Save edit"}</button>
      </div>
    </form> : role === "user" ? <div className="agent-user-bubble" dir="auto">{markdown}</div> :
      <ProjectAgentAnswer key={answerId} {...answer} id={answerId} markdown={markdown} actions={actions}
        showSources={answer.showSources ?? true} />}
    {attachments && <div className="agent-message-attachments">{attachments}</div>}
    {(role === "user" || onEdit || hasVariants) && <div className="agent-message-controls not-prose" role="group" aria-label="Message actions" data-agent-control>
      {role === "user" && actions && <ProjectAgentActionButton label={status === "copied" ? "Copied" : "Copy message"}
        disabled={busy || editing} onClick={() => void copy(markdown)}>{status === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}</ProjectAgentActionButton>}
      {onEdit && !editing && <button ref={editTrigger} type="button" className="agent-action-button" aria-label="Edit message" title="Edit message"
        disabled={busy || streaming} onClick={() => {
          if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
          setDraft(markdown); setEditRevision(revision); setError(""); setEditing(true);
        }}><Pencil aria-hidden /></button>}
      {hasVariants && variants && <div className="agent-message-variants" role="group" aria-label="Response versions">
        <ProjectAgentActionButton label="Previous response version" disabled={busy || editing || streaming || variants.index === 0}
          onClick={() => void switchVariant(variants.index - 1)}><ChevronLeft aria-hidden /></ProjectAgentActionButton>
        <output aria-live="polite">{busy ? <Loader2 aria-label="Loading response version" className="agent-status-spinner" /> : `${variants.index + 1} / ${variants.count}`}</output>
        <ProjectAgentActionButton label="Next response version" disabled={busy || editing || streaming || variants.index === variants.count - 1}
          onClick={() => void switchVariant(variants.index + 1)}><ChevronRight aria-hidden /></ProjectAgentActionButton>
      </div>}
      {role === "user" && <span className="agent-action-feedback" role="status">{status === "copied" ? "Copied" :
        status === "error" ? "Copy failed. Select the message and copy it manually." : ""}</span>}
    </div>}
    {error && <p role="alert" className="agent-action-feedback">{error}</p>}
  </article>;
}
