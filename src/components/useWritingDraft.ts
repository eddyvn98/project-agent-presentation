"use client";

import { useEffect, useRef, useState } from "react";

export type WritingDocumentChange = { originalSource: string; title: string; body: string };
type DocumentText = { title: string; body: string };
type SaveDocument = (change: WritingDocumentChange) => void | Promise<void>;

/** A draft is transient until its host adapter confirms the save. */
export function useWritingDraft(source: string, parsed: DocumentText, onSave?: SaveDocument) {
  const [accepted, setAccepted] = useState<WritingDocumentChange | null>(null);
  const [draft, setDraft] = useState<WritingDocumentChange | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const sequence = useRef(0);
  const pending = useRef<number | null>(null);
  const mounted = useRef(false);
  const latestSource = useRef(source);
  latestSource.current = source;
  const current = accepted?.originalSource === source ? accepted : parsed;
  const saving = status === "saving";
  const conflict = Boolean(draft && draft.originalSource !== source);
  const dirty = Boolean(draft && (draft.title !== current.title || draft.body !== current.body));

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; sequence.current += 1; };
  }, []);

  useEffect(() => {
    sequence.current += 1;
    pending.current = null;
    setAccepted(null);
    setStatus("idle");
    // A host may update its source before its save promise settles.
    setDraft((value) => value && value.originalSource !== source &&
      value.title.trim() === parsed.title && value.body.trim() === parsed.body ? null : value);
  }, [source, parsed.title, parsed.body]);

  function begin() {
    if (!onSave || saving) return;
    setDraft((value) => value ?? { originalSource: source, title: current.title, body: current.body });
    setStatus("idle");
  }

  function update(field: "title" | "body", value: string) {
    if (saving) return;
    setDraft((previous) => previous ? { ...previous, [field]: value } : previous);
    setStatus("idle");
  }

  function cancel() {
    if (saving) return;
    setDraft(null);
    setStatus("idle");
  }

  function reset() {
    if (saving) return;
    setDraft({ originalSource: source, title: current.title, body: current.body });
    setStatus("idle");
  }

  function clearFeedback() {
    if (!saving) setStatus("idle");
  }

  async function save() {
    if (!onSave || !draft || pending.current !== null || saving || conflict || !dirty || !draft.body.trim()) return;
    const request = ++sequence.current;
    pending.current = request;
    const change = { ...draft, title: draft.title.trim().slice(0, 120) };
    setStatus("saving");
    try {
      await onSave(change);
      if (!mounted.current || request !== sequence.current || latestSource.current !== change.originalSource) return;
      setAccepted(change);
      setDraft(null);
      setStatus("saved");
    } catch {
      if (mounted.current && request === sequence.current) setStatus("error");
    } finally {
      if (pending.current === request) pending.current = null;
    }
  }

  return { current, draft, status, saving, conflict, dirty, begin, update, cancel, reset, clearFeedback, save };
}
