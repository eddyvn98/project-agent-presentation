"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Globe, Monitor, Plus, Smartphone, X } from "lucide-react";
import { CANVAS_LAYOUT_STYLE } from "./ProjectAgentFilePreview";
import type { ActivityLanguage } from "@/lib/project-agent/activity-language";

type Tab = { index: number; location: string; active: boolean };
type Browser = { connected: boolean; viewerUrl?: string | null; tabs?: Tab[];
  control?: { paused: boolean; revision: number }; viewport?: { width: number; height: number } };
const labels = {
  en: { open: "Open Browser", close: "Close panel", end: "End session", take: "Take control",
    handback: "Hand back to Agent", url: "Website address", go: "Go", tab: "New tab",
    mobile: "Mobile", desktop: "Desktop", waiting: "Opening browser…",
    protected: "Live viewer needs a trusted, access-controlled Steel viewer origin.",
    error: "Browser unavailable" },
  vi: { open: "Mở trình duyệt", close: "Đóng bảng", end: "Kết thúc phiên",
    take: "Tự thao tác", handback: "Giao lại cho Agent", url: "Địa chỉ website",
    go: "Truy cập", tab: "Tab mới", mobile: "Điện thoại", desktop: "Máy tính",
    waiting: "Đang mở trình duyệt…",
    protected: "Cần cấu hình Steel Viewer được bảo vệ quyền truy cập để xem trực tiếp.",
    error: "Không thể mở trình duyệt" },
};
const empty: Browser = { connected: false };
function viewerUrl(raw: string, interactive: boolean): string | null {
  if (typeof window === "undefined") return null;
  let url: URL;
  try { url = new URL(raw, window.location.origin); } catch { return null; }
  const local = ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (!["http:", "https:"].includes(url.protocol) || (url.origin !== window.location.origin && !local)) return null;
  url.searchParams.set("interactive", String(interactive));
  url.searchParams.set("hideOverlay", "true");
  url.searchParams.set("hideInteractionDialog", "true");
  return url.toString();
}
/** One project-level browser panel; the website canvas contains no app controls. */
export function ProjectAgentProjectBrowser({ projectId, language = "en" }: {
  projectId: string; language?: ActivityLanguage;
}) {
  const ui = labels[language === "vi" ? "vi" : "en"];
  const base = "/api/projects/" + encodeURIComponent(projectId) + "/agent/browser";
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Browser>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [address, setAddress] = useState("");
  const [mobile, setMobile] = useState(false);
  const [width, setWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const resized = useRef<number | null>(null);
  const dismissed = useRef(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch(base, { cache: "no-store", signal });
    if (!res.ok) throw new Error(ui.error + " (" + res.status + ")");
    const value = await res.json() as Browser;
    if (!signal?.aborted) setStatus(value);
    return value;
  }, [base, ui.error]);
  const perform = useCallback(async (op: string, fields: Record<string, unknown> = {}) => {
    const res = await fetch(base, { method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, ...fields }) });
    const value = await res.json() as Browser & { error?: string };
    if (!res.ok) throw new Error(value.error ?? ui.error);
    setStatus(value);
    return value;
  }, [base, ui.error]);
  const act = async (op: string, fields: Record<string, unknown> = {}) => {
    setBusy(true); setError("");
    try { await perform(op, fields); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const show = async () => {
    dismissed.current = false;
    setOpen(true); setBusy(true); setError("");
    try {
      const current = await refresh();
      if (!current.connected) await perform("start");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const end = async () => {
    setBusy(true);
    try {
      const res = await fetch(base, { method: "DELETE", cache: "no-store" });
      if (!res.ok) throw new Error(ui.error);
      setStatus(empty); setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    dismissed.current = false;
    const abort = new AbortController();
    const interval = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await refresh(abort.signal);
        if (next.connected && !dismissed.current) setOpen(true);
      } catch { /* The server can be unavailable while the chat mounts. */ }
    }, 3000);
    return () => { abort.abort(); window.clearInterval(interval); };
  }, [projectId, refresh]);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(abort.signal).catch(() => {});
    }, 2500);
    return () => { abort.abort(); window.clearInterval(interval); };
  }, [open, refresh]);
  useEffect(() => {
    if (!open || !status.control?.paused) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void perform("heartbeat").catch(() => {});
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [open, status.control?.paused, perform]);
  useEffect(() => {
    if (!open || !status.connected || !status.control?.paused || mobile || !canvas.current) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      if (resized.current !== null) window.clearTimeout(resized.current);
      resized.current = window.setTimeout(() => {
        const width = Math.max(320, Math.min(1920, Math.round(rect.width)));
        const height = Math.max(480, Math.min(1080, Math.round(rect.height)));
        void perform("viewport", { width, height }).catch(() => {});
      }, 400);
    });
    observer.observe(canvas.current);
    return () => { observer.disconnect(); if (resized.current !== null) window.clearTimeout(resized.current); };
  }, [open, mobile, status.connected, status.control?.paused, perform]);
  const resize = (clientX: number) => {
    setWidth(Math.max(360, Math.min(window.innerWidth * 0.8, window.innerWidth - clientX)));
  };
  const resizeKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    setWidth(Math.max(360, Math.min(window.innerWidth * 0.8,
      (width ?? window.innerWidth * 0.44) + (event.key === "ArrowLeft" ? 24 : -24))));
  };
  const style = width ? { "--browser-preview-width": width + "px" } as CSSProperties : undefined;
  const paused = Boolean(status.control?.paused);
  const playerUrl = status.viewerUrl ? viewerUrl(status.viewerUrl, paused) : null;
  return <>
    <button type="button" title={ui.open} aria-label={ui.open}
      onClick={() => void show()} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
      <Globe className="h-4 w-4" />
    </button>
    {open && <><style>{CANVAS_LAYOUT_STYLE}</style>
      <aside data-project-agent-canvas="open" aria-label={ui.open} style={style}
        className="fixed right-0 top-12 z-[70] flex h-[calc(100dvh-3rem)] w-full flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950 md:w-[var(--browser-preview-width,44vw)]">
        <button type="button" role="separator" aria-label="Resize browser panel" aria-orientation="vertical"
          onKeyDown={resizeKey} onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
            event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setResizing(true);
          }} onPointerMove={(event: PointerEvent<HTMLButtonElement>) => { if (resizing) resize(event.clientX); }}
          onPointerUp={() => setResizing(false)} onPointerCancel={() => setResizing(false)}
          className="absolute left-0 top-0 hidden h-full w-2 -translate-x-1/2 cursor-col-resize touch-none md:block" />
        <div className="flex shrink-0 items-center gap-2 border-b p-2 dark:border-slate-800">
          <Globe className="h-4 w-4 shrink-0 text-orange-600" />
          <form className="flex min-w-0 flex-1 gap-1" onSubmit={(event) => {
            event.preventDefault();
            if (address.trim()) void act("navigate", { url: address.trim() });
          }}>
            <input aria-label={ui.url} value={address} onChange={event => setAddress(event.target.value)}
              placeholder="https://..." disabled={!paused || busy}
              className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900" />
            <button type="submit" disabled={!paused || busy} className="rounded border px-2 text-xs disabled:opacity-40">{ui.go}</button>
          </form>
          <button type="button" aria-label={ui.close} onClick={() => { dismissed.current = true; setOpen(false); }}
            className="rounded p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav aria-label="Browser tabs" className="flex shrink-0 items-center gap-1 overflow-x-auto border-b p-1 dark:border-slate-800">
          {(status.tabs ?? []).map(tab => <button type="button" key={tab.index}
            disabled={!paused || busy} onClick={() => void act("switch_tab", { tabIndex: tab.index })}
            aria-current={tab.active ? "page" : undefined}
            title={tab.location || "Tab " + (tab.index + 1)}
            className={"max-w-32 shrink-0 truncate rounded px-2 py-1 text-xs disabled:opacity-50 " +
              (tab.active ? "bg-slate-200 dark:bg-slate-700" : "bg-slate-50 dark:bg-slate-900")}>
            {tab.location || "Tab " + (tab.index + 1)}
          </button>)}
          <button type="button" disabled={!paused || busy} onClick={() => void act("new_tab")}
            aria-label={ui.tab} title={ui.tab} className="rounded p-1.5 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
        </nav>
        <div ref={canvas} className="relative min-h-0 flex-1 overflow-hidden bg-white dark:bg-slate-950">
          {status.connected && playerUrl ?
            <iframe title="Shared live browser" referrerPolicy="no-referrer"
              src={playerUrl}
              allow="autoplay; clipboard-read; clipboard-write"
              style={{ pointerEvents: paused ? "auto" : "none" }}
              className="h-full w-full border-0" /> :
            <div role="status" className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
              {busy ? ui.waiting : status.connected ? ui.protected : error || ui.waiting}
            </div>}
        </div>
        <footer className="flex shrink-0 items-center gap-2 border-t p-2 text-xs dark:border-slate-800">
          <button type="button" disabled={!status.connected || busy}
            onClick={() => void act(paused ? "release" : "takeover")}
            className="rounded-md border px-3 py-2 font-medium disabled:opacity-40 dark:border-slate-700">
            {paused ? ui.handback : ui.take}
          </button>
          <button type="button" disabled={!paused || busy} onClick={() => {
            setMobile(false); void act("viewport", { width: 1280, height: 800 });
          }} aria-label={ui.desktop} className="rounded border p-2 disabled:opacity-40"><Monitor className="h-4 w-4" /></button>
          <button type="button" disabled={!paused || busy} onClick={() => {
            setMobile(true); void act("viewport", { width: 390, height: 844 });
          }} aria-label={ui.mobile} className="rounded border p-2 disabled:opacity-40"><Smartphone className="h-4 w-4" /></button>
          <span className="min-w-0 flex-1 truncate text-red-600" role={error ? "alert" : undefined}>{error}</span>
          <button type="button" disabled={!status.connected || busy} onClick={() => void end()}
            className="rounded border px-2 py-2 text-slate-500 disabled:opacity-40 dark:border-slate-700">{ui.end}</button>
        </footer>
      </aside>
    </>}
  </>;
}
