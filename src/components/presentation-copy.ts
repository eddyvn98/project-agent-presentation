"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PresentationCopyStatus = "idle" | "copied" | "error";

/** Clipboard failure is explicit. Superseded/unmounted requests never change state. */
export function usePresentationCopy(resetAfterMs = 2400) {
  const [status, setStatus] = useState<PresentationCopyStatus>("idle");
  const mounted = useRef(false);
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const reset = useCallback(() => {
    request.current += 1;
    clearTimer();
    if (mounted.current) setStatus("idle");
  }, [clearTimer]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current += 1; clearTimer(); };
  }, [clearTimer]);
  const copy = useCallback(async (text: string): Promise<boolean> => {
    const id = ++request.current;
    clearTimer();
    if (mounted.current) setStatus("idle");
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      if (mounted.current && id === request.current) {
        setStatus("copied");
        timer.current = setTimeout(() => {
          if (mounted.current && id === request.current) setStatus("idle");
          timer.current = null;
        }, resetAfterMs);
      }
      return true;
    } catch {
      if (mounted.current && id === request.current) setStatus("error");
      return false;
    }
  }, [clearTimer, resetAfterMs]);
  return { copy, status, reset };
}

/** Download browser-created plain data; never opens or executes its contents. */
export function downloadPresentationText(text: string, filename: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_") || "download.txt";
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Browsers may still be reading the URL when click() returns.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
