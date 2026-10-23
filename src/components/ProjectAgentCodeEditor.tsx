"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Loader2, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./dialog";
import { usePresentationCopy } from "./presentation-copy";
import type { ProjectAgentCodeSaveChange } from "./project-agent-code-types";

/** Compare only: Markdown normalizes line endings and adds a final LF to nonempty code. */
export function matchesSavedCodeSource(actual: string, submitted: string): boolean {
  if (actual === submitted) return true;
  const normalized = submitted.replace(/\r\n?/g, "\n");
  // A single blank content line produces an empty Markdown code node.
  const rendered = !normalized || normalized === "\n" ? "" : normalized.endsWith("\n") ? normalized : `${normalized}\n`;
  return actual === rendered;
}

export function ProjectAgentCodeEditor({ code, language, streaming, onSave }: {
  code: string; language: string; streaming: boolean;
  /** false means the block source was superseded while the host was saving. */
  onSave: (change: ProjectAgentCodeSaveChange) => void | boolean | Promise<void | boolean>;
}) {
  const source = useRef({ code, language, revision: 0 });
  if (source.current.code !== code || source.current.language !== language) {
    source.current = { code, language, revision: source.current.revision + 1 };
  }
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(code);
  const [original, setOriginal] = useState(source.current);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [superseded, setSuperseded] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const mounted = useRef(false);
  const request = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const { copy, status, reset } = usePresentationCopy();
  const id = useId();
  const dirty = draft !== original.code;
  const conflict = superseded || source.current.revision !== original.revision;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current += 1; }; }, []);
  useEffect(() => {
    if (!open || (!dirty && !saving)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [open, dirty, saving]);
  useEffect(() => { if (confirmDiscard) keepRef.current?.focus(); }, [confirmDiscard]);
  const changeOpen = (next: boolean) => {
    if (busy.current) return;
    if (next) {
      setOriginal(source.current); setDraft(code); setMessage(""); setConfirmDiscard(false); setSuperseded(false); reset(); setOpen(true);
    } else if (dirty) setConfirmDiscard(true);
    else setOpen(false);
  };
  const save = async () => {
    if (busy.current || !dirty || conflict || streaming) return;
    busy.current = true; setSaving(true); setMessage(""); setConfirmDiscard(false);
    const operation = ++request.current;
    const revision = source.current.revision;
    const submitted = draft;
    const isCurrent = () => mounted.current && request.current === operation;
    const sourceIsCurrent = () => source.current.revision === revision ||
      (source.current.revision === revision + 1 && matchesSavedCodeSource(source.current.code, submitted) &&
        source.current.language === original.language);
    try {
      const accepted = await onSave({ originalCode: original.code, language: original.language, code: submitted });
      if (!isCurrent()) return;
      if (accepted === false || !sourceIsCurrent()) {
        setSuperseded(true);
        setMessage("The source changed while saving. Your draft is still here. Copy it before reopening the editor.");
        return;
      }
      setMessage("Code changes saved."); setOpen(false);
    } catch {
      if (isCurrent()) setMessage("Could not save these changes. Your draft is still here; please try again.");
    } finally {
      if (isCurrent()) { busy.current = false; setSaving(false); }
    }
  };
  return <>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild><button type="button" className="agent-data-action" disabled={streaming} aria-label="Edit code" title="Edit code"><Pencil aria-hidden="true" size={16} /></button></DialogTrigger>
      <DialogContent className="agent-code-editor-dialog flex w-[calc(100vw-1rem)] max-w-5xl flex-col overflow-auto" aria-busy={saving}
        onOpenAutoFocus={(event) => { event.preventDefault(); textareaRef.current?.focus(); }}
        onEscapeKeyDown={(event) => { if (busy.current) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (busy.current) event.preventDefault(); }}>
        <DialogTitle className="pr-8">Edit {original.language || "text"} code</DialogTitle>
        <DialogDescription>Change the source, then save when you are ready.</DialogDescription>
        <label htmlFor={id} className="sr-only">Code source</label>
        <textarea ref={textareaRef} id={id} value={draft} readOnly={saving} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off"
          aria-describedby={`${id}-status`} className="agent-code-editor-input" onChange={(event) => { setDraft(event.target.value); setMessage(""); reset(); }}
          onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void save(); } }} />
        <div id={`${id}-status`} role="status" aria-live="polite" className="agent-code-editor-status">
          {conflict && !saving ? "The source changed while you were editing. Copy your draft, then reopen the editor to use the latest source." : streaming ? "Wait for the code to finish before saving." : message}
          {status === "error" && <span> Could not copy the draft. Select it in the editor and copy it manually.</span>}
          {status === "copied" && <span> Draft copied.</span>}
        </div>
        {confirmDiscard ? <div role="group" aria-label="Unsaved code changes" className="agent-code-discard-confirmation">
          <p>Discard your unsaved changes?</p>
          <button ref={keepRef} type="button" className="agent-data-action" onClick={() => { setConfirmDiscard(false); textareaRef.current?.focus(); }}>Keep editing</button>
          <button type="button" className="agent-data-action" onClick={() => { setConfirmDiscard(false); setOpen(false); setMessage(""); }}>Discard changes</button>
        </div> : <div className="agent-code-editor-actions">
          <button type="button" className="agent-data-action" onClick={() => void copy(draft)}>{status === "copied" ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}Copy draft</button>
          <button type="button" className="agent-data-action" disabled={saving} onClick={() => changeOpen(false)}>Cancel</button>
          <button type="button" className="agent-code-save" disabled={saving || streaming || conflict || !dirty} onClick={() => void save()}>
            {saving && <Loader2 aria-hidden="true" size={16} className="animate-spin" />}{saving ? "Saving…" : "Save changes"}
          </button>
        </div>}
      </DialogContent>
    </Dialog>
    {!open && message && <span role="status" className="sr-only">{message}</span>}
  </>;
}
