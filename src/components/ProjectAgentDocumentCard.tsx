"use client";

import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, FileText, Maximize2, Pencil, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { projectAgentMarkdownComponents } from "./ProjectAgentMarkdown";
import { ProjectAgentMarkdownBody } from "./ProjectAgentMarkdownBody";
import { ProjectAgentMarkdownContext } from "./ProjectAgentMarkdownContext";
import { ProjectAgentResponseContext } from "./ProjectAgentResponseContext";
import { downloadPresentationText, usePresentationCopy } from "./presentation-copy";
import { useWritingDraft, type WritingDocumentChange } from "./useWritingDraft";
import "./presentation-writing.css";

export type { WritingDocumentChange } from "./useWritingDraft";

/** The text of an `agent-doc` fence: an optional first line `title: ...`, then the Markdown body. */
export function parseDocumentCard(source: string): { title: string; body: string } {
  const match = source.match(/^\s*title:[\t ]*([^\r\n]+)\r?\n([\s\S]*)$/i);
  if (match) return { title: match[1].trim().slice(0, 120), body: match[2].trim() };
  const heading = source.match(/^\s*#{1,3}\s+(.+)$/m);
  return { title: heading?.[1].trim().slice(0, 120) ?? "", body: source.trim() };
}

const filename = (title: string) => title.toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "document";

function Body({ body }: { body: string }) {
  const parent = useContext(ProjectAgentMarkdownContext);
  // A writing draft is saved as one document; its nested fences have no independent save identity.
  const context = useMemo(() => ({ ...parent, options: { ...parent.options, streaming: false,
    streamingCodeStartLine: null, onDocumentSave: undefined, onCodeSave: undefined } }), [parent]);
  return <div className="agent-writing-body">
    <ProjectAgentMarkdownContext.Provider value={context}>
      <ProjectAgentMarkdownBody markdown={body} components={projectAgentMarkdownComponents} />
    </ProjectAgentMarkdownContext.Provider>
  </div>;
}

export type ProjectAgentDocumentCardProps = {
  source: string;
  /** The host confirms saving and should replace the original fence in its persisted message. */
  onSave?: (change: WritingDocumentChange) => void | Promise<void>;
};

/** A self-contained writing block. Editing is available only with a host save adapter. */
export function ProjectAgentDocumentCard(props: ProjectAgentDocumentCardProps) {
  const scope = useContext(ProjectAgentResponseContext);
  return <WritingCard key={scope ?? "writing"} {...props} />;
}

function WritingCard({ source, onSave }: ProjectAgentDocumentCardProps) {
  const parsed = useMemo(() => parseDocumentCard(source), [source]);
  const writing = useWritingDraft(source, parsed, onSave);
  const { current, draft, saving, conflict, dirty, status } = writing;
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "started" | "error">("idle");
  const clipboard = usePresentationCopy();
  const opener = useRef<HTMLElement | null>(null);
  const card = useRef<HTMLElement | null>(null);
  const editor = useRef<HTMLTextAreaElement | null>(null);
  const reader = useRef<HTMLDivElement | null>(null);
  const id = useId();
  const editable = Boolean(onSave && draft);
  const visible = editable && draft ? draft : current;
  const title = current.title || "Untitled draft";
  const wordCount = visible.body.trim() ? visible.body.trim().split(/\s+/u).length : 0;

  useEffect(() => {
    clipboard.reset();
    setDownloadStatus("idle");
  }, [current.body, current.title, clipboard.reset]);

  useEffect(() => {
    if (expanded && editable && !preview) editor.current?.focus();
  }, [expanded, editable, preview]);

  const feedback = status === "error" ? "Could not save changes. Your draft is still here. Try again."
    : status === "saved" ? "Changes saved."
    : clipboard.status === "error" ? "Could not copy. Select the text and copy it manually."
    : clipboard.status === "copied" ? "Text copied."
    : downloadStatus === "error" ? "Could not start the download. Try again or copy the text."
    : downloadStatus === "started" ? "Download started." : "";

  function download(content: { title: string; body: string }) {
    clipboard.reset();
    writing.clearFeedback();
    try {
      downloadPresentationText(content.body, `${filename(content.title)}.md`, "text/markdown;charset=utf-8");
      setDownloadStatus("started");
    } catch { setDownloadStatus("error"); }
  }

  function save() {
    clipboard.reset();
    setDownloadStatus("idle");
    void writing.save();
  }

  function open(element: HTMLElement, edit = false) {
    opener.current = element;
    if (edit) { writing.begin(); setPreview(false); }
    setExpanded(true);
  }

  function actions(inDialog: boolean) {
    return <div className="agent-writing-actions" aria-label="Writing actions">
      {onSave && !editable && <button type="button" className="agent-writing-button"
        onClick={(event) => { if (inDialog) { writing.begin(); setPreview(false); } else open(event.currentTarget, true); }}>
        <Pencil aria-hidden="true" />Edit
      </button>}
      {!inDialog && editable && <button type="button" className="agent-writing-button"
        onClick={(event) => open(event.currentTarget)}><Pencil aria-hidden="true" />Continue editing</button>}
      <button type="button" className="agent-writing-button" title="Copy text" aria-label="Copy text"
        onClick={() => { writing.clearFeedback(); setDownloadStatus("idle"); void clipboard.copy(inDialog ? visible.body : current.body); }}>
        {clipboard.status === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
      <button type="button" className="agent-writing-button" title="Download as Markdown"
        aria-label="Download as Markdown" onClick={() => download(inDialog ? visible : current)}><Download aria-hidden="true" /></button>
      {!inDialog && <button type="button" className="agent-writing-button" title="Expand writing"
        aria-label="Expand writing" onClick={(event) => open(event.currentTarget)}><Maximize2 aria-hidden="true" /></button>}
    </div>;
  }

  if (!current.body) return <p className="agent-writing-empty" role="status">This writing block is empty.</p>;

  return <Dialog open={expanded} onOpenChange={setExpanded}>
    <section ref={card} tabIndex={-1} className="agent-writing-card not-prose" aria-labelledby={`${id}-title`} data-writing-title={current.title}>
      <header className="agent-writing-header">
        <div className="agent-writing-heading"><span><FileText aria-hidden="true" />Writing</span>
          <h3 id={`${id}-title`}>{title}</h3>
        </div>
        {actions(false)}
      </header>
      {draft && (dirty || saving) && <p className="agent-writing-notice">{saving ? "Saving changes…" : "Unsaved edits"}</p>}
      <div className="agent-writing-preview"><Body body={current.body} /></div>
      <p className="agent-writing-feedback" role={expanded ? undefined : "status"} aria-live={expanded ? "off" : "polite"}>{expanded ? "" : feedback}</p>
    </section>
    <DialogContent className="agent-writing-dialog not-prose"
      onOpenAutoFocus={(event) => { event.preventDefault(); (editable && !preview && !saving ? editor.current : reader.current)?.focus(); }}
      onCloseAutoFocus={(event) => { event.preventDefault(); (opener.current?.isConnected ? opener.current : card.current)?.focus(); }}>
      <header className="agent-writing-dialog-header">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{editable ? "Edit the Markdown draft, then save your changes." : "Read, copy or download the complete draft."}</DialogDescription>
      </header>
      <div className="agent-writing-toolbar">
        {actions(true)}
        {editable && <div className="agent-writing-view" aria-label="Draft view">
          <button type="button" className="agent-writing-button" aria-pressed={!preview} onClick={() => setPreview(false)}>Edit</button>
          <button type="button" className="agent-writing-button" aria-pressed={preview} onClick={() => setPreview(true)}>Preview</button>
        </div>}
      </div>
      <div className="agent-writing-reader" ref={reader} tabIndex={-1}>
        {editable && draft ? <form className="agent-writing-editor" onSubmit={(event) => { event.preventDefault(); save(); }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if ((event.ctrlKey || event.metaKey) && (event.key === "Enter" || event.key.toLowerCase() === "s")) {
              event.preventDefault(); save();
            }
          }}>
          <label htmlFor={`${id}-draft-title`}>Title</label>
          <input id={`${id}-draft-title`} value={draft.title} maxLength={120} disabled={saving}
            onChange={(event) => writing.update("title", event.target.value)} />
          {preview ? <div className="agent-writing-rendered" aria-label="Draft preview"><Body body={draft.body} /></div>
            : <><label htmlFor={`${id}-draft-body`}>Draft · Markdown</label>
              <textarea id={`${id}-draft-body`} ref={editor} value={draft.body} disabled={saving} spellCheck
                aria-describedby={`${id}-draft-hint`} onChange={(event) => writing.update("body", event.target.value)} /></>}
          <p id={`${id}-draft-hint`} className="agent-writing-hint">{wordCount.toLocaleString()} words · {visible.body.length.toLocaleString()} characters. Ctrl/Cmd+Enter to save.</p>
          {conflict && <p className="agent-writing-conflict" role="alert">The original document changed. Copy your draft to keep it, then reset to the latest version before saving.</p>}
          <div className="agent-writing-edit-actions">
            <button type="submit" className="agent-writing-button agent-writing-primary" disabled={saving || conflict || !dirty || !draft.body.trim()}>{saving ? "Saving…" : "Save changes"}</button>
            <button type="button" className="agent-writing-button" disabled={saving} onClick={writing.cancel}>Cancel</button>
            <button type="button" className="agent-writing-button" disabled={saving} onClick={writing.reset}><RotateCcw aria-hidden="true" />{conflict ? "Reset to latest" : "Reset edits"}</button>
          </div>
        </form> : <Body body={current.body} />}
      </div>
      <p className="agent-writing-feedback agent-writing-dialog-feedback" role="status" aria-live="polite">{feedback || (saving ? "Saving changes…" : "")}</p>
    </DialogContent>
  </Dialog>;
}
