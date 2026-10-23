"use client";

import { useContext, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Download, Hash, Maximize2, WrapText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./dialog";
import { ProjectAgentCodeContent } from "./ProjectAgentCodeContent";
import { ProjectAgentCodeEditor, matchesSavedCodeSource } from "./ProjectAgentCodeEditor";
import { ProjectAgentCodePreview, ProjectAgentCodeViewTabs, type ProjectAgentCodeView } from "./ProjectAgentCodePreview";
import { ProjectAgentResponseContext } from "./ProjectAgentResponseContext";
import { ProjectAgentMoreActions } from "./ProjectAgentMoreActions";
import { downloadPresentationText, usePresentationCopy } from "./presentation-copy";
import type { ProjectAgentCodeBlockProps, ProjectAgentCodeSaveChange } from "./project-agent-code-types";
import "./code-table.css";

export type { ProjectAgentCodeBlockProps, ProjectAgentCodeSaveChange, ProjectAgentCodeSaveHandler,
  ProjectAgentCodePreviewInput, ProjectAgentCodePreviewRenderer } from "./project-agent-code-types";

const PLAIN_LANGUAGES = new Set(["", "text", "txt", "plain", "plaintext", "log", "output"]);
const EXTENSIONS: Record<string, string> = {
  javascript: "js", js: "js", typescript: "ts", ts: "ts", jsx: "jsx", tsx: "tsx",
  python: "py", py: "py", html: "html", css: "css", json: "json", yaml: "yaml", yml: "yml",
  bash: "sh", shell: "sh", sh: "sh", sql: "sql", rust: "rs", go: "go", java: "java",
  c: "c", cpp: "cpp", csharp: "cs", ruby: "rb", php: "php", xml: "xml", markdown: "md",
};

export function ProjectAgentCodeBlock({ language, code, streaming = false, onSave, renderPreview }: ProjectAgentCodeBlockProps) {
  const lang = language.toLowerCase().trim();
  const scope = useContext(ProjectAgentResponseContext);
  const source = useRef({ code, language: lang, scope, revision: 0 });
  if (source.current.code !== code || source.current.language !== lang || source.current.scope !== scope) source.current = { code, language: lang, scope, revision: source.current.revision + 1 };
  const [accepted, setAccepted] = useState<{ code: string; revision: number } | null>(null);
  const text = accepted?.revision === source.current.revision ? accepted.code : code;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const save = onSave ? async (change: ProjectAgentCodeSaveChange): Promise<boolean> => {
    const original = source.current;
    await onSave(change);
    if (!mounted.current) return false;
    const current = source.current;
    if (current.revision === original.revision) {
      setAccepted({ code: change.code, revision: current.revision });
      return true;
    }
    // Hosts can publish the accepted source before their save promise settles.
    return current.revision === original.revision + 1 && matchesSavedCodeSource(current.code, change.code) &&
      current.language === original.language && current.scope === original.scope;
  } : undefined;
  const plain = PLAIN_LANGUAGES.has(lang);
  const label = lang && lang !== "plaintext" && lang !== "plain" ? lang : "text";
  const [wrap, setWrap] = useState(plain);
  const [lineNumbers, setLineNumbers] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const [selectedView, setSelectedView] = useState<ProjectAgentCodeView>("code");
  const view = streaming || !renderPreview ? "code" : selectedView;
  const { copy, status, reset } = usePresentationCopy();
  const contentId = useId();
  useEffect(() => { reset(); setDownloadError(false); }, [text, reset]);
  const lineCount = Math.max(1, text.replace(/(?:\r\n|\r|\n)$/, "").split(/\r\n|\r|\n/).length);
  const long = lineCount > 18 || text.length > 2400;
  const download = () => {
    try { downloadPresentationText(text, `snippet.${EXTENSIONS[lang] || "txt"}`); setDownloadError(false); }
    catch { setDownloadError(true); }
  };
  const actions = <>
    {save && <ProjectAgentCodeEditor key={scope ?? "unscoped"} code={text} language={lang} streaming={streaming} onSave={save} />}
    <button type="button" className="agent-data-action" aria-label="Copy code" disabled={streaming} onClick={() => void copy(text)}>
      {status === "copied" ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}<span>{status === "copied" ? "Copied" : "Copy"}</span>
    </button>
    <ProjectAgentMoreActions label="More code actions" className="agent-data-action" items={[
      { id: "wrap", label: "Wrap code lines", icon: <WrapText aria-hidden size={16} />, pressed: wrap,
        keepOpen: true, onSelect: () => setWrap((value) => !value) },
      { id: "lines", label: "Show line numbers", icon: <Hash aria-hidden size={16} />, pressed: lineNumbers,
        keepOpen: true, onSelect: () => setLineNumbers((value) => !value) },
      { id: "download", label: "Download code", icon: <Download aria-hidden size={16} />, disabled: streaming, onSelect: download },
    ]} />
  </>;
  const feedback = <div className="agent-data-feedback" role="status" aria-live="polite" aria-atomic="true">
    {status === "copied" && <span className="sr-only">Code copied to clipboard.</span>}
    {status === "error" && <span>Could not copy. Select the code and copy it manually.</span>}
    {downloadError && <span>Could not download. You can still copy or select the code.</span>}
  </div>;
  const content = (enlarged = false) => {
    const id = enlarged ? `${contentId}-expanded` : contentId;
    return <>
      {renderPreview && <ProjectAgentCodeViewTabs id={id} view={view} onChange={setSelectedView} disabled={streaming} />}
      <div id={`${id}-panel`} role={renderPreview ? "tabpanel" : "region"} tabIndex={0}
        aria-label={renderPreview ? undefined : `${enlarged ? "Expanded " : ""}${label} code`}
        aria-labelledby={renderPreview ? `${id}-${view}-tab` : undefined}
        className={view === "code" ? "agent-code-scroll" : "agent-code-preview-panel"}
        data-expanded={enlarged || expanded || !long} data-wrap={wrap}>
        {view === "preview" && renderPreview ? <ProjectAgentCodePreview code={text} language={lang} render={renderPreview} />
          : <ProjectAgentCodeContent plain={plain || streaming} language={lang} code={text} wrap={wrap} lineNumbers={lineNumbers} />}
      </div>
    </>;
  };
  return <Dialog>
    <figure className={`agent-code-card not-prose ${plain ? "agent-code-text" : ""}`} aria-busy={streaming}>
      <figcaption className="agent-data-toolbar">
        <span className="agent-data-label">{label}{streaming && <span className="agent-code-writing">Writing…</span>}</span>
        <div className="agent-data-actions">{actions}
          <DialogTrigger asChild><button type="button" className="agent-data-action" aria-label="Expand code" title="Expand code"><Maximize2 aria-hidden="true" size={16} /></button></DialogTrigger>
        </div>
      </figcaption>
      {feedback}
      {content()}
      {long && view === "code" && <button type="button" className="agent-code-disclosure" aria-expanded={expanded} aria-controls={`${contentId}-panel`} onClick={() => setExpanded((value) => !value)}>
        {expanded ? <ChevronUp aria-hidden="true" size={15} /> : <ChevronDown aria-hidden="true" size={15} />}
        {expanded ? "Show less" : `Show all ${lineCount} lines`}
      </button>}
    </figure>
    <DialogContent className="agent-data-dialog flex w-[calc(100vw-1rem)] max-w-6xl flex-col overflow-hidden">
      <DialogTitle className="pr-8">{label} code</DialogTitle>
      <DialogDescription>{lineCount} {lineCount === 1 ? "line" : "lines"}. Scroll to read the full snippet.</DialogDescription>
      <div className={`agent-code-card agent-code-enlarged ${plain ? "agent-code-text" : ""}`} aria-busy={streaming}>
        <div className="agent-data-toolbar"><span className="agent-data-label">{label}{streaming && <span className="agent-code-writing">Writing…</span>}</span><div className="agent-data-actions">{actions}</div></div>
        {feedback}
        {content(true)}
      </div>
    </DialogContent>
  </Dialog>;
}
