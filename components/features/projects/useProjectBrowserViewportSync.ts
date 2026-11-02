import { useEffect, useRef, type RefObject } from "react";

type BrowserControl = { paused?: boolean; activeTaskId?: string };
type Viewport = { width: number; height: number };
type Tab = { index: number; active: boolean };
type SyncOptions = {
  canvas: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  agentRunning: boolean;
  control?: BrowserControl;
  tabs?: Tab[];
  viewport?: Viewport;
  perform(op: string, fields?: Record<string, unknown>): Promise<unknown>;
  onError(message: string): void;
};

export function useProjectBrowserViewportSync({ canvas, enabled, control, tabs,
  viewport, perform, onError, agentRunning }: SyncOptions) {
  const lastRequested = useRef("");
  const activeTab = tabs?.find(tab => tab.active)?.index ?? 0;
  const agentActive = agentRunning || Boolean(control?.activeTaskId);
  const canResize = enabled && (control?.paused || !agentActive);

  useEffect(() => {
    const element = canvas.current;
    if (!canResize || !element) return;
    let timer = 0;
    const sync = () => {
      const width = Math.max(320, Math.min(1920, Math.round(element.clientWidth)));
      const height = Math.max(480, Math.min(1080, Math.round(element.clientHeight)));
      const key = `${activeTab}:${width}x${height}`;
      if (lastRequested.current === key || (viewport?.width === width && viewport.height === height)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        lastRequested.current = key;
        try {
          await perform("viewport", { width, height });
          onError("");
        } catch (cause) {
          lastRequested.current = "";
          onError(cause instanceof Error ? cause.message : String(cause));
        }
      }, 250);
    };
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    sync();
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, [activeTab, agentRunning, canvas, canResize, control?.activeTaskId, control?.paused,
    onError, perform, viewport?.height, viewport?.width]);
}
