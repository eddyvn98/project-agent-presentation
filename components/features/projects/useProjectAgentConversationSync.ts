"use client";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";
import { NEW_PROJECT_AGENT_VIEW_ID, selectProjectAgentView } from "@/lib/project-agent/view-session";

type Page = { tasks?: PublicProjectAgentTask[]; nextCursor?: string | null };
const MAX_INITIAL_SCAN_PAGES = 6;

/** Poll recent tasks while retaining older pages already read for a long conversation. */
export function useProjectAgentConversationSync(
  projectId: string | null, viewId: string | null,
  setTasks: Dispatch<SetStateAction<PublicProjectAgentTask[]>>,
  setLoadedViewId: Dispatch<SetStateAction<string | null>>,
  setLoadError: Dispatch<SetStateAction<string>>,
) {
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const olderRef = useRef<(() => Promise<void>) | null>(null);
  const loadOlder = useCallback(async () => { await olderRef.current?.(); }, []);

  useEffect(() => {
    olderRef.current = null;
    setHasOlder(false);
    setLoadingOlder(false);
    if (!projectId || !viewId) {
      setTasks([]);
      setLoadedViewId(null);
      setLoadError("");
      return;
    }
    let cancelled = false, loading = false, scanning = false, initial = true;
    let lastPayload = "";
    let cursor: string | null = null;
    let latest: PublicProjectAgentTask[] = [];
    const older = new Map<string, PublicProjectAgentTask>();
    const controller = new AbortController();
    setTasks([]);
    setLoadedViewId(null);
    setLoadError("");

    const allTasks = () => {
      const found = new Map<string, PublicProjectAgentTask>();
      for (const task of older.values()) found.set(task.id, task);
      for (const task of latest) found.set(task.id, task);
      return [...found.values()];
    };
    const publish = () => {
      if (cancelled) return;
      const all = allTasks();
      if (viewId === NEW_PROJECT_AGENT_VIEW_ID) {
        setTasks([]); setLoadedViewId(viewId); return;
      }
      const byId = all.find((task) => task.id === viewId);
      const key = byId?.conversationId ?? viewId;
      setTasks(all.filter((task) => (task.conversationId ?? task.id) === key));
      setLoadedViewId(viewId);
      if (byId?.conversationId && byId.conversationId !== viewId) selectProjectAgentView(projectId, byId.conversationId);
    };
    const read = async (next?: string): Promise<Page> => {
      const params = new URLSearchParams({ limit: "20", ...(next ? { cursor: next } : {}) });
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks?${params}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("Could not load this Project Agent chat");
      const raw = await response.text();
      const page = JSON.parse(raw) as Page;
      if (!Array.isArray(page.tasks)) throw new Error("Invalid chat history response");
      return page;
    };
    const fetchOlder = async () => {
      if (scanning || !cursor || cancelled) return;
      scanning = true;
      setLoadingOlder(true);
      try {
        const page = await read(cursor);
        if (cancelled) return;
        for (const task of page.tasks!) older.set(task.id, task);
        cursor = page.nextCursor ?? null;
        setHasOlder(Boolean(cursor));
        publish();
        setLoadError("");
      } catch (cause) {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Could not load older messages");
      } finally {
        scanning = false;
        if (!cancelled) setLoadingOlder(false);
      }
    };
    olderRef.current = fetchOlder;
    const load = async () => {
      if (loading || cancelled) return;
      loading = true;
      try {
        const page = await read();
        if (cancelled) return;
        const signature = JSON.stringify(page);
        const changed = initial || signature !== lastPayload;
        lastPayload = signature;
        // Preserve turns falling off the newest page while a long chat is open.
        for (const task of latest) older.set(task.id, task);
        latest = page.tasks!;
        if (initial) {
          initial = false;
          cursor = page.nextCursor ?? null;
          // Opening a chat discovered by server-side search may require older pages.
          // This bounded scan happens only on opening, not on each polling interval.
          if (viewId !== NEW_PROJECT_AGENT_VIEW_ID && !latest.some((task) => (task.conversationId ?? task.id) === viewId || task.id === viewId)) {
            for (let index = 0; index < MAX_INITIAL_SCAN_PAGES && cursor && !cancelled; index += 1) {
              const historical = await read(cursor);
              if (cancelled) return;
              for (const task of historical.tasks!) older.set(task.id, task);
              cursor = historical.nextCursor ?? null;
              if (historical.tasks!.some((task) => (task.conversationId ?? task.id) === viewId || task.id === viewId)) break;
            }
          }
        }
        setHasOlder(Boolean(cursor));
        if (changed) publish();
        setLoadError("");
      } catch (cause) {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Could not load Project Agent chat");
      } finally { loading = false; }
    };
    void load();
    const timer = window.setInterval(() => void load(), 1_500);
    return () => { cancelled = true; controller.abort(); window.clearInterval(timer); olderRef.current = null; };
  }, [projectId, viewId, setTasks, setLoadedViewId, setLoadError]);

  return { hasOlder, loadingOlder, loadOlder };
}
