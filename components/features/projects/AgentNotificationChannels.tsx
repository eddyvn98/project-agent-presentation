"use client";
import { useCallback, useEffect, useState } from "react";
export function AgentNotificationChannels() {
  const [status, setStatus] = useState({ available: false, connected: false, username: "" });
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const r = await fetch("/api/project-agent/notification-channels", { cache: "no-store" });
    if (!r.ok) throw new Error("Channel status unavailable");
    setStatus(await r.json());
  }, []);
  useEffect(() => {
    void refresh().catch(e => setError(String(e)));
    const timer = setInterval(() => void refresh().catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function mutate(method: "POST" | "DELETE") {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/project-agent/notification-channels", { method });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "Channel change failed");
      const data = await r.json() as { link?: string };
      setLink(data.link ?? "");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Channel unavailable"); }
    finally { setBusy(false); }
  }
  return <section aria-label="Agent notification channels" className="space-y-2 rounded-xl border p-4">
    <h2 className="font-semibold">Remote notifications</h2>
    <p className="text-sm text-slate-500">Optional verified Telegram alerts for task results and approvals. Only generic status is sent, never task content, cookies or credentials.</p>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    <p className="text-xs">{status.connected ? "Telegram connected" :
      status.available ? "Telegram not connected" : "Telegram bot is not configured on the server"}</p>
    {status.available && !status.connected && <button type="button" disabled={busy}
      onClick={() => void mutate("POST")} className="rounded border px-3 py-2 text-xs">
      Connect Telegram securely</button>}
    {link && <a href={link} target="_blank" rel="noopener noreferrer"
      className="block w-fit rounded bg-slate-900 px-3 py-2 text-xs text-white">
      Open Telegram and tap Start (link expires in 15 minutes)</a>}
    {status.connected && <button type="button" disabled={busy}
      onClick={() => { if (window.confirm("Disconnect Telegram notifications?")) void mutate("DELETE"); }}
      className="rounded border px-3 py-2 text-xs text-red-600">Disconnect</button>}
  </section>;
}
