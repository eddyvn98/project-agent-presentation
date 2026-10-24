"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Expand, Loader2, X } from "lucide-react";
import type { ActivityLanguage } from "@/lib/project-agent/activity-language";
import { browserActionLabel } from "@/lib/project-agent/browser-watch-labels";
import { browserAssistText } from "@/lib/project-agent/browser-assist-labels";

type Preview = {
  watching: boolean; sequence: number; updatedAt: number;
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
  const [control, setControl] = useState({ paused: false, revision: 0 });
  const [entry, setEntry] = useState("");
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
  const toggle = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(base, { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ watch: !preview?.watching }) });
      const data = await response.json() as { preview?: Preview | null; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Browser preview unavailable");
      setPreview(data.preview ?? null);
      if (!data.preview?.watching) setExpanded(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  };
  const command = async (action: Record<string, unknown>) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(base + "/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Browser action unavailable");
      if (action.op === "type") setEntry("");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  };
  const clickPreview = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!control.paused) { setExpanded(true); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    void command({ op: "click", x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
  };
  const image = base + "?image=1&v=" + (preview?.sequence ?? 0);
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
        <button type="button" disabled={loading} onClick={() => void command({ op: control.paused ? "release" : "takeover" })}
          className={control.paused ? "rounded-full bg-orange-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50" : "rounded-full border border-orange-300 px-3 py-1.5 text-xs text-orange-700 disabled:opacity-50 dark:text-orange-300"}>
          {control.paused ? actions.release : actions.take}
        </button>
        {control.paused && <span role="status" className="text-xs text-orange-600">{actions.click}</span>}
      </div>}
      <p role="status" className="text-xs text-slate-500">{preview.hasImage ? ui.last + ": " + browserActionLabel(preview.action, language) : ui.waiting}</p>
      {preview.location && <p className="truncate text-xs text-slate-400" title={preview.location}>{preview.location}</p>}
      {preview.hasImage && <button type="button" disabled={loading && control.paused} onClick={clickPreview} title={control.paused ? actions.help : ui.enlarge}
        className="relative block w-full overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={ui.last} className="block h-auto w-full" />
        {!control.paused && <Expand className="absolute right-2 top-2 h-5 w-5 rounded bg-slate-900/70 p-1 text-white" />}
      </button>}
      {control.paused && <div className="space-y-2">
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
