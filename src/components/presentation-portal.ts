"use client";

import { useEffect, useState } from "react";

/** Portals stay inside the browser's fullscreen tree to remain visible and focusable. */
export function usePresentationPortal(): Element | null {
  const [container, setContainer] = useState<Element | null>(null);
  useEffect(() => {
    const sync = () => setContainer(document.fullscreenElement);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  return container;
}
