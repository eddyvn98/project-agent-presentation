"use client";

import { ArrowLeft, ArrowRight, Globe, RotateCw, X } from "lucide-react";

type Labels = { back: string; forward: string; reload: string; url: string; go: string; close: string };
type Props = {
  address: string;
  connected: boolean;
  busy: boolean;
  ui: Labels;
  setAddress(value: string): void;
  onAction(op: string): void;
  onNavigate(): void;
  onClose(): void;
};

const controlClass = "grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-600 transition hover:bg-slate-200/70 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700";

export function ProjectAgentBrowserToolbar({ address, connected, busy, ui,
  setAddress, onAction, onNavigate, onClose }: Props) {
  return <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-slate-50/90 px-3 dark:border-slate-800 dark:bg-slate-900/90">
    <div className="flex items-center gap-0.5">
      <button type="button" aria-label={ui.back} title={ui.back} disabled={!connected || busy}
        onClick={() => onAction("back")} className={controlClass}><ArrowLeft className="h-4 w-4" /></button>
      <button type="button" aria-label={ui.forward} title={ui.forward} disabled={!connected || busy}
        onClick={() => onAction("forward")} className={controlClass}><ArrowRight className="h-4 w-4" /></button>
      <button type="button" aria-label={ui.reload} title={ui.reload} disabled={!connected || busy}
        onClick={() => onAction("reload")} className={controlClass}><RotateCw className="h-4 w-4" /></button>
    </div>
    <form className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 shadow-sm transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:focus-within:ring-blue-950" onSubmit={event => {
      event.preventDefault(); onNavigate();
    }}>
      <Globe className="h-4 w-4 shrink-0 text-slate-400" />
      <input aria-label={ui.url} value={address} onChange={event => setAddress(event.target.value)}
        placeholder="https://example.com or google.com" disabled={!connected || busy}
        className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 disabled:opacity-50 dark:text-slate-100" />
      <button type="submit" aria-label={ui.go} title={ui.go} disabled={!connected || busy}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-blue-100 hover:text-blue-700 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300">
        <ArrowRight className="h-4 w-4" />
      </button>
    </form>
    <button type="button" aria-label={ui.close} title={ui.close} onClick={onClose}
      className={controlClass}><X className="h-4 w-4" /></button>
  </header>;
}
