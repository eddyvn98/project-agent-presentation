"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type WheelEvent } from "react";
import type { ActivityLanguage } from "@/lib/project-agent/activity-language";
import { browserAssistText } from "@/lib/project-agent/browser-assist-labels";
import { ProjectAgentBrowserLoginDialog } from "./ProjectAgentBrowserLoginDialog";

type Preview = {
  watching: boolean; sequence: number; updatedAt: number;
  history: Array<{ sequence: number; action: string; updatedAt: number; location: string; marker?: { x: number; y: number; kind: "agent" | "human" } }>;
  action: string; location: string; hasImage: boolean; finished: boolean;
};
type BrowserStatus = { preview: Preview | null; watching?: boolean; shared?: boolean };
type BrowserCommandResult = { ok: boolean; sequence?: number; privateLoginRequired?: boolean };
export function ProjectAgentBrowserWatch({ projectId, taskId, running, language = "en",
  manualMode = false, visible = true }: {
  projectId: string; taskId: string; running: boolean; language?: ActivityLanguage;
  manualMode?: boolean; visible?: boolean;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [streamFailed, setStreamFailed] = useState(false);
  const [streamEpoch, setStreamEpoch] = useState(0);
  const [shared, setShared] = useState(false);
  const [frameUrl, setFrameUrl] = useState("");
  const [frameId, setFrameId] = useState("");
  const frameRef = useRef("");
  const autoWatchStarted = useRef(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const actionQueue = useRef<Promise<BrowserCommandResult>>(Promise.resolve({ ok: true }));
  const textBuffer = useRef("");
  const textTimer = useRef<number | null>(null);
  const ui = browserAssistText(language);
  const base = "/api/projects/" + encodeURIComponent(projectId) + "/agent/tasks/" + encodeURIComponent(taskId) + "/browser";
  const refresh = useCallback(async (signal?: AbortSignal): Promise<BrowserStatus | null> => {
    const response = await fetch(base, { cache: "no-store", signal });
    if (!response.ok) return null;
    const data = await response.json() as BrowserStatus;
    if (!signal?.aborted) {
      setPreview(data.preview); setShared(Boolean(data.shared));
      if (data.watching && !data.preview) setPreview({ watching: true, sequence: 0,
        updatedAt: Date.now(), history: [], action: "", location: "", hasImage: false, finished: false });
    }
    return data;
  }, [base]);
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null); setError("");
    if (!running) void refresh(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [refresh, running]);
  const setWatching = useCallback(async (watch: boolean) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(base, { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ watch }) });
      const data = await response.json() as { preview?: Preview | null; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Browser preview unavailable");
      setPreview(data.preview ?? null);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }, [base, refresh]);
  useEffect(() => {
    if (!running || autoWatchStarted.current) return;
    autoWatchStarted.current = true;
    void setWatching(true);
  }, [running, setWatching]);
  useEffect(() => {
    if (!preview?.watching) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh().catch(() => {});
    }, 1_600);
    return () => window.clearInterval(timer);
  }, [preview?.watching, refresh]);
  useEffect(() => {
    if (!visible || !running || manualMode || !preview?.watching) return;
    const timer = window.setInterval(() => {
      setStreamFailed(false);
      setStreamEpoch(value => value + 1);
    }, 17_000);
    return () => window.clearInterval(timer);
  }, [visible, running, manualMode, preview?.watching]);
  useEffect(() => {
    if (!manualMode || !shared || !visible || !running) return;
    let alive = true;
    const capture = async () => {
      try {
        const response = await fetch(base + "/frame", { cache: "no-store" });
        if (!response.ok || !alive) return;
        const token = response.headers.get("X-Browser-Frame-Id") ?? "";
        if (!token) return;
        const url = URL.createObjectURL(await response.blob());
        if (!alive) { URL.revokeObjectURL(url); return; }
        frameRef.current = token; setFrameId(token);
        setFrameUrl(previous => { if (previous) URL.revokeObjectURL(previous); return url; });
      } catch { /* Invalid frames remain unusable until refreshed. */ }
    };
    void capture();
    const interval = window.setInterval(() => { void capture(); }, 2_000);
    return () => {
      alive = false; window.clearInterval(interval); frameRef.current = ""; setFrameId("");
      setFrameUrl(previous => { if (previous) URL.revokeObjectURL(previous); return ""; });
    };
  }, [manualMode, shared, visible, running, base]);
  const command = async (action: Record<string, unknown>): Promise<BrowserCommandResult> => {
    setLoading(true); setError("");
    try {
      const response = await fetch(base + "/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      const result = await response.json() as { error?: string; approvalTicket?: string; privateLoginRequired?: boolean };
      if (!response.ok && result.approvalTicket && action.op === "click" && !action.approvalTicket) {
        if (window.confirm("This control may send, publish, delete, buy or change account data. Confirm this ONE click?"))
          return command({ ...action, approvalTicket: result.approvalTicket });
        return { ok: false };
      }
      if (!response.ok) throw new Error(result.error ?? "Browser action unavailable");
      const data = await refresh();
      return { ok: true, sequence: data?.preview?.sequence, privateLoginRequired: result.privateLoginRequired };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      if (/password|sensitive|security-code entry/i.test(message)) setLoginOpen(true);
      return { ok: false };
    }
    finally { setLoading(false); }
  };
  function enqueue(action: Record<string, unknown>): Promise<BrowserCommandResult> {
    const next = actionQueue.current.catch(() => ({ ok: false })).then(() => command(action));
    actionQueue.current = next;
    return next;
  }
  async function flushText() {
    if (textTimer.current !== null) window.clearTimeout(textTimer.current);
    textTimer.current = null;
    const text = textBuffer.current; textBuffer.current = "";
    if (!text || !running) return;
    await enqueue({ op: "type", text });
  }
  function queueText(character: string) {
    textBuffer.current = (textBuffer.current + character).slice(0, 600);
    if (textTimer.current !== null) window.clearTimeout(textTimer.current);
    textTimer.current = window.setTimeout(() => { void flushText(); }, 280);
  }
  async function clickPreview(event: MouseEvent<HTMLDivElement>) {
    if (!manualMode || !running || !(shared ? frameId : preview?.hasImage)) return;
    surfaceRef.current?.focus();
    const rect = event.currentTarget.getBoundingClientRect();
    await flushText();
    const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
    const result = await enqueue({ op: "click", frame: Math.max(1, preview.sequence),
      ...(shared ? { frameId: frameRef.current } : {}), x, y });
    if (result?.privateLoginRequired) setLoginOpen(true);
  }
  async function scrollPreview(event: WheelEvent<HTMLDivElement>) {
    if (!manualMode || !running || !(shared ? frameId : preview?.hasImage)) return;
    event.preventDefault();
    surfaceRef.current?.focus();
    await flushText();
    await enqueue({ op: "scroll", direction: event.deltaY < 0 ? "up" : "down" });
  }
  async function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ["Tab", "Escape", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"];
    if (keys.includes(event.key)) {
      event.preventDefault(); await flushText();
      const result = await enqueue({ op: "key", key: event.key });
      if (result?.privateLoginRequired) setLoginOpen(true);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); queueText(event.key);
    }
  }
  const image = base + "?image=1&v=" + (preview?.sequence ?? 0);
  const streaming = visible && running && preview?.watching && !manualMode && !streamFailed;
  const live = base + "/live?v=" + streamEpoch;
  if (!visible || (!running && !preview?.watching)) return null;
  return <>
    <section aria-label={ui.open} className="not-prose relative overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700">
      {(shared ? (manualMode ? Boolean(frameUrl) : Boolean(preview?.watching)) : preview?.hasImage) ? <div ref={surfaceRef} role="application" tabIndex={manualMode ? 0 : -1} aria-label="Browser tab"
        aria-busy={loading} onKeyDown={(event) => void keyDown(event)}
        onClick={(event) => void clickPreview(event)} onWheel={(event) => void scrollPreview(event)}
        className="block w-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shared && manualMode ? frameUrl : streaming ? live : image} alt="Browser tab" draggable={false}
          onError={() => { if (streaming) setStreamFailed(true); }}
          className="block h-auto w-full select-none" />
      </div> : <div aria-label="Loading browser tab" className="h-64 animate-pulse bg-slate-100 dark:bg-slate-900" />}
      {error && <p role="alert" className="absolute bottom-3 left-3 right-3 rounded-lg bg-red-700/90 px-3 py-2 text-xs text-white">{error}</p>}
    </section>
    {loginOpen && <ProjectAgentBrowserLoginDialog base={base} language={language} onClose={() => setLoginOpen(false)} />}
  </>;
}
