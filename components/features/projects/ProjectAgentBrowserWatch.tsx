"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Expand, Loader2, X } from "lucide-react";
import type { ActivityLanguage } from "@/lib/project-agent/activity-language";
import { browserActionLabel } from "@/lib/project-agent/browser-watch-labels";
import { browserAssistText } from "@/lib/project-agent/browser-assist-labels";

type Preview = {
  watching: boolean; sequence: number; updatedAt: number;
  history: Array<{ sequence: number; action: string; updatedAt: number; location: string; marker?: { x: number; y: number; kind: "agent" | "human" } }>;
  action: string; location: string; hasImage: boolean; finished: boolean;
};
const LABEL: Record<ActivityLanguage, { watch: string; stop: string; waiting: string; last: string; enlarge: string; close: string; privacy: string }> = {
  en: { watch: "Watch browser", stop: "Stop watching", waiting: "Waiting for the agent to open a webpage", last: "Last browser frame", enlarge: "Expand screenshot", close: "Close preview", privacy: "Only you can see these frames. Form fields are hidden." },
  vi: { watch: "Xem Agent thao tác web", stop: "Dừng xem", waiting: "Đang chờ Agent mở trang web", last: "Ảnh trình duyệt gần nhất", enlarge: "Phóng to ảnh", close: "Đóng ảnh", privacy: "Chỉ bạn xem được ảnh này. Các ô nhập liệu đã được che." },
  es: { watch: "Ver navegador", stop: "Dejar de ver", waiting: "Esperando al navegador del agente", last: "Última captura", enlarge: "Ampliar imagen", close: "Cerrar", privacy: "Solo tú puedes ver las capturas. Los campos de texto están ocultos." },
  fr: { watch: "Voir le navigateur", stop: "Arrêter", waiting: "En attente du navigateur", last: "Dernière image", enlarge: "Agrandir", close: "Fermer", privacy: "Vous seul voyez ces images. Les champs de saisie sont masqués." },
  de: { watch: "Browser ansehen", stop: "Ansicht beenden", waiting: "Warte auf den Browser", last: "Letztes Bild", enlarge: "Vergrößern", close: "Schließen", privacy: "Nur Sie sehen die Bilder. Eingabefelder sind verdeckt." },
  pt: { watch: "Ver navegador", stop: "Parar de ver", waiting: "Aguardando o navegador", last: "Última imagem", enlarge: "Ampliar", close: "Fechar", privacy: "Só você vê estas imagens. Os campos de entrada são ocultados." },
  ja: { watch: "ブラウザーを表示", stop: "表示を停止", waiting: "ブラウザーを待機中", last: "最新の画面", enlarge: "拡大", close: "閉じる", privacy: "画像は本人のみ閲覧できます。入力欄は非表示です。" },
  ko: { watch: "브라우저 보기", stop: "보기 중지", waiting: "브라우저 대기 중", last: "최근 화면", enlarge: "확대", close: "닫기", privacy: "본인만 볼 수 있으며 입력란은 가려집니다." },
  zh: { watch: "查看浏览器", stop: "停止查看", waiting: "等待代理打开网页", last: "最新画面", enlarge: "放大", close: "关闭", privacy: "只有您可以查看，输入框已遮盖。" },
  ru: { watch: "Смотреть браузер", stop: "Прекратить просмотр", waiting: "Ожидание браузера", last: "Последний кадр", enlarge: "Увеличить", close: "Закрыть", privacy: "Кадры видны только вам. Поля ввода скрыты." },
  ar: { watch: "عرض المتصفح", stop: "إيقاف العرض", waiting: "انتظار فتح المتصفح", last: "آخر صورة", enlarge: "تكبير", close: "إغلاق", privacy: "أنت فقط ترى الصور. حقول الإدخال محجوبة." },
  hi: { watch: "ब्राउज़र देखें", stop: "देखना बंद करें", waiting: "ब्राउज़र की प्रतीक्षा", last: "नवीनतम चित्र", enlarge: "बड़ा करें", close: "बंद करें", privacy: "केवल आप चित्र देख सकते हैं। इनपुट फ़ील्ड छिपाए गए हैं।" },
};

export function ProjectAgentBrowserWatch({ projectId, taskId, running, language = "en" }: {
  projectId: string; taskId: string; running: boolean; language?: ActivityLanguage;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const [liveEpoch, setLiveEpoch] = useState(0);
  const [control, setControl] = useState({ paused: false, revision: 0 });
  const [entry, setEntry] = useState("");
  const [loginSecret, setLoginSecret] = useState("");
  const [loginReady, setLoginReady] = useState(false);
  const [loginHost, setLoginHost] = useState("");
  const [allowAutomation, setAllowAutomation] = useState(false);
  const [ssoHosts, setSsoHosts] = useState("");
  const [grantMode, setGrantMode] = useState<"read" | "interact">("read");
  const ui = LABEL[language], actions = browserAssistText(language);
  const base = "/api/projects/" + encodeURIComponent(projectId) + "/agent/tasks/" + encodeURIComponent(taskId) + "/browser";
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(base, { cache: "no-store", signal });
    if (response.ok) {
      const data = await response.json() as { preview: Preview | null; control?: { paused: boolean; revision: number } };
      if (!signal?.aborted) { setPreview(data.preview); if (data.control) setControl(data.control); }
    }
  }, [base]);
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null); setError(""); setExpanded(false);
    void refresh(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    if (!preview?.watching) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh().catch(() => {});
    }, 1_600);
    return () => window.clearInterval(timer);
  }, [preview?.watching, refresh]);
  useEffect(() => {
    if (!live || !preview?.watching || !running) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setLiveEpoch(x => x + 1);
    }, 13_000);
    return () => window.clearInterval(timer);
  }, [live, preview?.watching, running]);
  const toggle = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(base, { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ watch: !preview?.watching }) });
      const data = await response.json() as { preview?: Preview | null; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Browser preview unavailable");
      setPreview(data.preview ?? null);
      if (!data.preview?.watching) { setExpanded(false); setLive(false); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  };
  const command = async (action: Record<string, unknown>): Promise<void> => {
    setLoading(true); setError("");
    try {
      const response = await fetch(base + "/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      const result = await response.json() as { error?: string; approvalTicket?: string };
      if (!response.ok && result.approvalTicket && action.op === "click" && !action.approvalTicket) {
        if (window.confirm("This control may send, publish, delete, buy or change account data. Confirm this ONE click?"))
          await command({ ...action, approvalTicket: result.approvalTicket });
        return;
      }
      if (!response.ok) throw new Error(result.error ?? "Browser action unavailable");
      if (action.op === "type") setEntry("");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  };
  const loginCommand = async (payload: Record<string, unknown>) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(base + "/control", {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json() as { error?: string; host?: string; grant?: { host: string } };
      if (!response.ok) throw new Error(data.error ?? "Login action failed");
      if (payload.op === "login_begin") { setLoginReady(true); setLoginHost(data.host ?? ""); }
      if (payload.op === "login_save") { setLoginReady(false); setLoginHost(data.grant?.host ?? loginHost); }
      if (payload.op === "login_revoke") { setLoginReady(false); setLoginHost(""); }
      setLoginSecret("");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Login action failed"); setLoginSecret(""); }
    finally { setLoading(false); }
  };
  const clickPreview = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!control.paused || (shown && shown.sequence !== preview?.sequence)) { setExpanded(true); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    setSelected(null);
    void command({ op: "click", frame: preview?.sequence, x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
  };
  const history = preview?.history ?? [];
  const shown = history.find((step) => step.sequence === selected) ?? history.at(-1);
  const marker = shown?.marker;
  const image = base + "?image=1" + (shown ? "&sequence=" + shown.sequence : "") + "&v=" + (shown?.sequence ?? 0);
  if (!running && !preview?.watching) return null;
  return <section aria-label={ui.watch} className="not-prose my-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900/40">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300"><Eye className="h-4 w-4" />{ui.watch}</span>
      <button type="button" disabled={loading || (!running && !preview?.watching)} onClick={() => void toggle()}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : preview?.watching ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {preview?.watching ? ui.stop : ui.watch}
      </button>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    {preview?.watching && <div className="mt-3 space-y-2">
      {running && preview.hasImage && <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={live} onClick={() => { setLive(v => !v); setSelected(null); }}
          className="rounded-full border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-600">
          {live ? "Show history" : "Live view"}
        </button>
        <button type="button" disabled={loading} onClick={() => void command({ op: control.paused ? "release" : "takeover" })}
          className={control.paused ? "rounded-full bg-orange-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50" : "rounded-full border border-orange-300 px-3 py-1.5 text-xs text-orange-700 disabled:opacity-50 dark:text-orange-300"}>
          {control.paused ? actions.release : actions.take}
        </button>
        {control.paused && <span role="status" className="text-xs text-orange-600">{actions.click}</span>}
      </div>}
      <p role="status" className="text-xs text-slate-500">{preview.hasImage ? ui.last + ": " + browserActionLabel(preview.action, language) : ui.waiting}</p>
      {preview.location && <p className="truncate text-xs text-slate-400" title={preview.location}>{preview.location}</p>}
      {history.length > 1 && <div aria-label="Browser step history" className="flex gap-1.5 overflow-x-auto pb-1">
        {history.map((step) => <button type="button" key={step.sequence} disabled={control.paused}
          onClick={() => setSelected(step.sequence)}
          aria-current={shown?.sequence === step.sequence ? "step" : undefined}
          className={`shrink-0 rounded-md border px-2 py-1 text-[11px] ${shown?.sequence === step.sequence ? "border-orange-500 text-orange-700" : "border-slate-300 text-slate-500"}`}>
          {step.sequence} · {browserActionLabel(step.action, language)}
        </button>)}
      </div>}
      {live && running && <div className="relative overflow-hidden rounded-lg border bg-white dark:bg-slate-900"
        aria-label="Live browser stream, view-only">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={liveEpoch} src={base + "/live?v=" + liveEpoch} alt="Live browser preview"
          className="block h-auto w-full" />
        <p className="px-2 py-1 text-[11px] text-slate-500">View only. Use step history to click while controlling the browser.</p>
      </div>}
      {!live && preview.hasImage && <button type="button" disabled={loading && control.paused} onClick={clickPreview} title={control.paused ? actions.help : ui.enlarge}
        className="relative block w-full overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={ui.last} className="block h-auto w-full" />
        {marker && <span aria-hidden="true" className="pointer-events-none absolute z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-orange-500/50 shadow-[0_0_0_2px_#f97316]" style={{ left: (marker.x * 100) + "%", top: (marker.y * 100) + "%" }} />}
        {!control.paused && <Expand className="absolute right-2 top-2 h-5 w-5 rounded bg-slate-900/70 p-1 text-white" />}
      </button>}
      {control.paused && <div className="space-y-2">
        <div className="space-y-2 rounded-lg border border-slate-300 p-2 dark:border-slate-700" aria-label="Personal website login">
          <div className="text-xs font-semibold">Personal website login</div>
          <p className="text-[11px] text-slate-500">Sign in once for your account across projects. Credentials are entered in the private browser control, never the Agent chat.</p>
          {!loginReady ? <button type="button" disabled={loading}
            onClick={() => void loginCommand({ op: "login_begin" })}
            className="rounded-md border px-2 py-1.5 text-xs">Start private login</button> : <>
            <p className="text-xs">Website: {loginHost}</p>
            <form autoComplete="off" onSubmit={(event) => {
              event.preventDefault(); if (loginSecret) void loginCommand({ op: "login_secret", text: loginSecret });
            }} className="flex gap-2">
              <input type="password" autoComplete="off" value={loginSecret}
                onChange={(event) => setLoginSecret(event.target.value)}
                placeholder="Password or one-time code" maxLength={2048}
                className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs dark:bg-slate-900" />
              <button type="submit" disabled={loading || !loginSecret}
                className="rounded-md border px-2 py-1.5 text-xs">Enter securely</button>
            </form>
            <button type="button" disabled={loading} onClick={() => void loginCommand({ op: "login_submit" })}
              className="rounded-md border px-2 py-1.5 text-xs">Submit login field</button>
            <label className="flex items-center gap-2 text-xs">Access level
              <select value={grantMode} onChange={(e) => setGrantMode(e.target.value as "read" | "interact")}
                className="rounded-md border px-1 py-1 dark:bg-slate-900">
                <option value="read">Read only</option><option value="interact">Interact</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={allowAutomation}
                onChange={(event) => setAllowAutomation(event.target.checked)} />
              Allow reuse by unattended tasks
            </label>
            <label className="block text-xs">Other SSO identity-provider domains (optional, comma-separated; only grant domains you recognize)
              <input type="text" value={ssoHosts} onChange={event => setSsoHosts(event.target.value)}
                placeholder="login.example.com" className="mt-1 w-full rounded-md border px-2 py-1.5 dark:bg-slate-900" />
            </label>
            <button type="button" disabled={loading} onClick={() => void loginCommand({
              op: "login_save", mode: grantMode, automation: allowAutomation,
              relatedHosts: ssoHosts.split(",").map(v => v.trim()).filter(Boolean),
            })} className="rounded-md border border-orange-400 px-2 py-1.5 text-xs">
              Save encrypted browser login
            </button>
          </>}
          {loginHost && <button type="button" disabled={loading}
            onClick={() => void loginCommand({ op: "login_revoke", url: "https://" + loginHost })}
            className="ml-2 rounded-md border px-2 py-1.5 text-xs text-red-600">Revoke this site</button>}
        </div>
        <p className="text-xs text-slate-500">{actions.help}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" disabled={loading} onClick={() => void command({ op: "scroll", direction: "up" })} className="rounded-md border px-2 py-1.5 text-xs dark:border-slate-600">{actions.up}</button>
          <button type="button" disabled={loading} onClick={() => void command({ op: "scroll", direction: "down" })} className="rounded-md border px-2 py-1.5 text-xs dark:border-slate-600">{actions.down}</button>
          <button type="button" disabled={loading} onClick={() => void command({ op: "key", key: "Tab" })} className="rounded-md border px-2 py-1.5 text-xs dark:border-slate-600">Tab</button>
          <button type="button" disabled={loading} onClick={() => void command({ op: "key", key: "Backspace" })} className="rounded-md border px-2 py-1.5 text-xs dark:border-slate-600">⌫</button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); if (entry.trim()) void command({ op: "type", text: entry }); }} className="flex gap-2">
          <input value={entry} onChange={(event) => setEntry(event.target.value)} maxLength={600} placeholder={actions.type}
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200" />
          <button type="submit" disabled={loading || !entry.trim()} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-white disabled:opacity-50">{actions.send}</button>
        </form>
      </div>}
      <p className="text-[11px] text-slate-400">{ui.privacy}</p>
    </div>}
    {expanded && preview?.hasImage && <div role="dialog" aria-modal="true" aria-label={ui.enlarge}
      className="fixed inset-0 z-[110] flex flex-col items-center justify-center gap-3 bg-black/90 p-4">
      <button type="button" onClick={() => setExpanded(false)} aria-label={ui.close}
        className="self-end rounded-full bg-slate-800 p-2 text-white"><X className="h-5 w-5" /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={ui.last} className="max-h-[85vh] max-w-full object-contain" />
    </div>}
  </section>;
}
