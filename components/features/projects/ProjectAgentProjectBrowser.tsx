"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { createPortal } from "react-dom";
import { Globe, Plus, X } from "lucide-react";
import type { ActivityLanguage } from "@/lib/project-agent/activity-language";
import { ProjectAgentBrowserToolbar } from "./ProjectAgentBrowserToolbar";
import { useProjectBrowserViewportSync } from "./useProjectBrowserViewportSync";

type Tab = { index: number; location: string; active: boolean };
type Browser = { connected: boolean; viewerUrl?: string | null; tabs?: Tab[];
  control?: { paused: boolean; revision: number; activeTaskId?: string }; viewport?: { width: number; height: number } };
const labels = {
  en: { open: "Open Browser", close: "Close panel", end: "End session", take: "Take control",
    handback: "Hand back to Agent", url: "Website address", go: "Go", tab: "New tab",
    closeTab: "Close tab", back: "Back", forward: "Forward", reload: "Reload",
    mobile: "Mobile", desktop: "Desktop", waiting: "Opening browser…",
    protected: "Live viewer needs a trusted, access-controlled Steel viewer origin.",
    error: "Browser unavailable" },
  vi: { open: "Mở trình duyệt", close: "Đóng bảng", end: "Kết thúc phiên", // vi-allow: localized UI copy
    take: "Tự thao tác", handback: "Giao lại cho Agent", url: "Địa chỉ website", // vi-allow: localized UI copy
    go: "Truy cập", tab: "Tab mới", closeTab: "Đóng tab", back: "Quay lại", // vi-allow: localized UI copy
    forward: "Tiến tới", reload: "Tải lại", mobile: "Điện thoại", desktop: "Máy tính", // vi-allow: localized UI copy
    waiting: "Đang mở trình duyệt…", // vi-allow: localized UI copy
    protected: "Cần cấu hình Steel Viewer được bảo vệ quyền truy cập để xem trực tiếp.", // vi-allow: localized UI copy
    error: "Không thể mở trình duyệt" }, // vi-allow: localized UI copy
};
const OPEN_SHARED_BROWSER_EVENT = "project-agent-shared-browser-open";
const empty: Browser = { connected: false };
function normalizeBrowserAddress(value: string): string {
  const address = value.trim();
  if (!address || /^https?:\/\//i.test(address)) return address;
  return "https://" + address.replace(/^\/\//, "");
}
function viewerUrl(raw: string, interactive: boolean): string | null {
  if (typeof window === "undefined") return null;
  let url: URL;
  try { url = new URL(raw, window.location.origin); } catch { return null; }
  const local = ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (!["http:", "https:"].includes(url.protocol) || (url.origin !== window.location.origin && !local)) return null;
  // The authenticated proxy maps one exact URL; never append player params to it.
  if (!url.pathname.startsWith("/private-steel-viewer/projects/")) {
    url.searchParams.set("interactive", String(interactive));
    url.searchParams.set("hideOverlay", "true");
    url.searchParams.set("hideInteractionDialog", "true");
  }
  return url.toString();
}
/** One project-level browser panel; the website canvas contains no app controls. */
export function ProjectAgentProjectBrowser({ projectId, language = "en", agentRunning = false }: {
  projectId: string; language?: ActivityLanguage; agentRunning?: boolean;
}) {
  const ui = labels[language === "vi" ? "vi" : "en"];
  const base = "/api/projects/" + encodeURIComponent(projectId) + "/agent/browser";
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Browser>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [address, setAddress] = useState("");
  const [frameVersion, setFrameVersion] = useState(0);
  const [width, setWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const dismissed = useRef(false);
  const humanLeaseUntil = useRef(0);
  const inputQueue = useRef<Promise<void>>(Promise.resolve());
  const inputBusy = useRef(0);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch(base, { cache: "no-store", signal });
    if (!res.ok) throw new Error(ui.error + " (" + res.status + ")");
    const value = await res.json() as Browser;
    if (!signal?.aborted) setStatus(value);
    return value;
  }, [base, ui.error]);
  const activeLocation = status.tabs?.find(tab => tab.active)?.location;
  useEffect(() => {
    if (!activeLocation || document.activeElement?.getAttribute("aria-label") === ui.url) return;
    setAddress(activeLocation);
  }, [activeLocation, ui.url]);
  const claimHumanControl = useCallback(async () => {
    if (humanLeaseUntil.current > Date.now() + 2_000) return;
    const primary = status.control?.paused || humanLeaseUntil.current > 0 ? "heartbeat" : "takeover";
    let res = await fetch(base, { method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: primary }) });
    if (!res.ok) res = await fetch(base, { method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: primary === "heartbeat" ? "takeover" : "heartbeat" }) });
    const value = await res.json() as Browser & { error?: string };
    if (!res.ok) throw new Error(value.error ?? ui.error);
    humanLeaseUntil.current = Date.now() + 8_000;
    setStatus(value);
  }, [base, status.control?.paused, ui.error]);
  const perform = useCallback(async (op: string, fields: Record<string, unknown> = {}) => {
    if (!["start", "takeover", "release", "heartbeat", "viewport"].includes(op)) await claimHumanControl();
    const res = await fetch(base, { method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, ...fields }) });
    const value = await res.json() as Browser & { error?: string };
    if (!res.ok) throw new Error(value.error ?? ui.error);
    if (op === "release") humanLeaseUntil.current = 0;
    if (op === "takeover") humanLeaseUntil.current = Date.now() + 8_000;
    setStatus(value);
    return value;
  }, [base, claimHumanControl, ui.error]);
  useProjectBrowserViewportSync({ canvas, enabled: open && status.connected, agentRunning,
    control: status.control, tabs: status.tabs, viewport: status.viewport, perform, onError: setError });
  const sendHumanInput = (op: string, fields: Record<string, unknown>) => {
    // Serializing preserves click-before-type order across remote CDP requests.
    if (inputBusy.current >= 50) return;
    inputBusy.current++;
    setError("");
    inputQueue.current = inputQueue.current.catch(() => {}).then(async () => {
      await claimHumanControl();
      const res = await fetch(base, { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, ...fields }) });
      if (!res.ok) {
        const value = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(value?.error ?? ui.error + " (" + res.status + ")");
      }
    }).catch(cause => {
      setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { inputBusy.current--; });
  };
  const viewerClick = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    event.currentTarget.focus();
    const image = event.currentTarget.parentElement?.querySelector("img[alt='Live browser page']");
    const naturalWidth = image instanceof HTMLImageElement ? image.naturalWidth : 0;
    const naturalHeight = image instanceof HTMLImageElement ? image.naturalHeight : 0;
    const scale = naturalWidth && naturalHeight ? Math.min(rect.width / naturalWidth,
      rect.height / naturalHeight) : 1;
    const contentWidth = naturalWidth ? naturalWidth * scale : rect.width;
    const contentHeight = naturalHeight ? naturalHeight * scale : rect.height;
    const left = rect.left + (rect.width - contentWidth) / 2;
    const top = rect.top + (rect.height - contentHeight) / 2;
    if (event.clientX < left || event.clientX > left + contentWidth ||
        event.clientY < top || event.clientY > top + contentHeight) return;
    const x = (event.clientX - left) / contentWidth;
    const y = (event.clientY - top) / contentHeight;
    sendHumanInput("click", { x, y });
  };
  const viewerWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    sendHumanInput("wheel", { deltaY: Math.max(-1200, Math.min(1200, event.deltaY)) });
  };
  const viewerKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault(); sendHumanInput("key", { key: "ControlOrMeta+A" });
    } else if (!event.altKey && !event.ctrlKey && !event.metaKey &&
               event.key.length === 1) {
      event.preventDefault(); sendHumanInput("type", { text: event.key });
    } else if (["Enter", "Tab", "Backspace", "Delete", "Escape",
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End",
      "PageUp", "PageDown", " "].includes(event.key)) {
      event.preventDefault();
      sendHumanInput("key", { key: event.key === " " ? "Space" : event.key });
    }
  };
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
  useEffect(() => {
    const openForProject = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId === projectId) void show();
    };
    window.addEventListener(OPEN_SHARED_BROWSER_EVENT, openForProject);
    return () => window.removeEventListener(OPEN_SHARED_BROWSER_EVENT, openForProject);
  }, [projectId]);
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
    if (!open || !status.connected || status.viewerUrl) return;
    const interval = window.setInterval(() => setFrameVersion(value => value + 1), 900);
    return () => window.clearInterval(interval);
  }, [open, status.connected, status.viewerUrl]);
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
  const layoutWidth = width ? width + "px" : "44vw";
  const layoutStyle = `@media (min-width: 768px) { body:has([data-project-agent-browser='open']) main { margin-right: ${layoutWidth}; transition: margin-right 200ms ease-in-out; } }`;
  const playerUrl = status.viewerUrl ? viewerUrl(status.viewerUrl, true) : null;
  return <>
    <button type="button" title={ui.open} aria-label={ui.open}
      onClick={() => void show()} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
      <Globe className="h-4 w-4" />
    </button>
    {open && typeof document !== "undefined" && createPortal(<>
      <style>{layoutStyle}</style>
      <aside data-project-agent-canvas="open" data-project-agent-browser="open" aria-label={ui.open} style={style}
        className="fixed right-0 top-12 z-[70] flex h-[calc(100dvh-3rem)] w-full flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950 md:w-[var(--browser-preview-width,44vw)]">
        <button type="button" role="separator" aria-label="Resize browser panel" aria-orientation="vertical"
          onKeyDown={resizeKey} onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
            event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setResizing(true);
          }} onPointerMove={(event: PointerEvent<HTMLButtonElement>) => { if (resizing) resize(event.clientX); }}
          onPointerUp={() => setResizing(false)} onPointerCancel={() => setResizing(false)}
          className="absolute left-0 top-0 hidden h-full w-2 -translate-x-1/2 cursor-col-resize touch-none md:block" />
        <ProjectAgentBrowserToolbar address={address} connected={status.connected} busy={busy} ui={ui}
          setAddress={setAddress} onAction={op => void act(op)}
          onNavigate={() => { const url = normalizeBrowserAddress(address); if (url) void act("navigate", { url }); }}
          onClose={() => { dismissed.current = true; setOpen(false); }} />
        <nav aria-label="Browser tabs" className="flex shrink-0 items-end gap-1 overflow-x-auto border-b bg-slate-100/80 px-2 pt-1 dark:border-slate-800 dark:bg-slate-950">
          {(status.tabs ?? []).map(tab => <span key={tab.index} className="inline-flex max-w-40 shrink-0 items-center rounded bg-slate-50 dark:bg-slate-900">
            <button type="button" disabled={!status.connected || busy}
              onClick={() => void act("switch_tab", { tabIndex: tab.index })} aria-current={tab.active ? "page" : undefined}
              title={tab.location || "Tab " + (tab.index + 1)}
              className={"min-w-0 truncate rounded-t-lg px-2 py-2 text-xs disabled:opacity-50 " +
                (tab.active ? "border border-b-0 border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800" : "bg-transparent hover:bg-slate-200/70 dark:hover:bg-slate-800")}>
              {tab.location || "Tab " + (tab.index + 1)}
            </button>
            {(status.tabs?.length ?? 0) > 1 && <button type="button" disabled={!status.connected || busy}
              aria-label={ui.closeTab + " " + (tab.index + 1)} title={ui.closeTab}
              onClick={() => void act("close_tab", { tabIndex: tab.index })}
              className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50 dark:hover:bg-slate-700 dark:hover:text-white">
              <X className="h-3 w-3" />
            </button>}
          </span>)}
          <button type="button" disabled={!status.connected || busy} onClick={() => void act("new_tab")}
            aria-label={ui.tab} title={ui.tab} className="rounded p-1.5 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
        </nav>
        <div ref={canvas} className="relative min-h-0 flex-1 overflow-hidden bg-white dark:bg-slate-950">
          {status.connected ?
            <>
              {playerUrl ? <iframe title="Shared live browser" referrerPolicy="no-referrer"
                src={playerUrl} allow="autoplay" style={{ pointerEvents: "none" }}
                className="h-full w-full border-0" /> :
                <img alt="Live browser page" src={base + "?frame=" + frameVersion}
                  draggable={false} className="h-full w-full select-none object-contain" />}
              <div tabIndex={0} role="application"
                aria-label="Interact with the shared browser"
                onPointerDown={viewerClick} onWheel={viewerWheel} onKeyDown={viewerKey}
                onPaste={event => { event.preventDefault();
                  const value = event.clipboardData.getData("text");
                  if (value) sendHumanInput("type", { text: value.slice(0, 1000) });
                }}
                className="absolute inset-0 cursor-default outline-none focus-visible:ring-2 focus-visible:ring-orange-500" />
              {error && <div role="alert" className="pointer-events-none absolute bottom-2 left-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700 shadow dark:bg-red-950 dark:text-red-200">
                {error}
              </div>}
            </> :
            <div role="status" className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
              {busy ? ui.waiting : status.connected ? ui.protected : error || ui.waiting}
            </div>}
        </div>
      </aside>
    </>, document.body)}
  </>;
}
