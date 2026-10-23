"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { groupProjectAgentTasks, type ProjectAgentConversation } from "@/lib/project-agent/conversations";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";
import { PROJECT_AGENT_CHATS_CHANGED } from "./useProjectAgentChatActions";

type TaskPage = { tasks?: PublicProjectAgentTask[]; nextCursor?: string | null };
type ChatList = {
  conversations: ProjectAgentConversation[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string;
  retry: () => void;
  loadMore: () => Promise<void>;
};

/** Cursor-based Project chat history. Search and pagination share the same server-side scope. */
export function useProjectAgentConversations(projectId: string | null, query = ""): ChatList {
  const [tasks, setTasks] = useState<PublicProjectAgentTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [scope, setScope] = useState("");
  const [reload, setReload] = useState(0);
  const active = useRef("");
  const pageController = useRef<AbortController | null>(null);
  const loadingPage = useRef(false);
  const retry = useCallback(() => setReload((value) => value + 1), []);
  const wanted = `${projectId ?? ""}:${query.trim()}`;

  useEffect(() => {
    if (!projectId) return;
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<{ projectId: string }>).detail?.projectId === projectId) retry();
    };
    window.addEventListener(PROJECT_AGENT_CHATS_CHANGED, onChanged);
    return () => window.removeEventListener(PROJECT_AGENT_CHATS_CHANGED, onChanged);
  }, [projectId, retry]);

  useEffect(() => {
    active.current = wanted;
    pageController.current?.abort();
    loadingPage.current = false;
    setTasks([]);
    setCursor(null);
    setScope("");
    setLoadingMore(false);
    setError("");
    if (!projectId) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: "20", ...(query.trim() ? { q: query.trim() } : {}) });
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`Could not load chats (${response.status})`);
        const data = await response.json() as TaskPage;
        if (!Array.isArray(data.tasks)) throw new Error("Invalid chat history response");
        if (controller.signal.aborted || active.current !== wanted) return;
        setTasks(data.tasks);
        setCursor(data.nextCursor ?? null);
        setScope(wanted);
      } catch (cause) {
        if (!controller.signal.aborted && active.current === wanted) setError(cause instanceof Error ? cause.message : "Could not load chats");
      } finally {
        if (!controller.signal.aborted && active.current === wanted) setLoading(false);
      }
    }, query.trim() ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [projectId, query, reload, wanted]);

  const loadMore = useCallback(async () => {
    if (!projectId || !cursor || loadingPage.current || scope !== wanted) return;
    loadingPage.current = true;
    const controller = new AbortController();
    pageController.current = controller;
    setLoadingMore(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "20", cursor, ...(query.trim() ? { q: query.trim() } : {}) });
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks?${params}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load older chats (${response.status})`);
      const data = await response.json() as TaskPage;
      if (!Array.isArray(data.tasks)) throw new Error("Invalid older chat history response");
      if (controller.signal.aborted || active.current !== wanted) return;
      setTasks((old) => {
        const ids = new Set(old.map((task) => task.id));
        return [...old, ...data.tasks!.filter((task) => !ids.has(task.id))];
      });
      setCursor(data.nextCursor ?? null);
    } catch (cause) {
      if (!controller.signal.aborted && active.current === wanted) setError(cause instanceof Error ? cause.message : "Could not load older chats");
    } finally {
      if (pageController.current === controller) { pageController.current = null; loadingPage.current = false; }
      if (!controller.signal.aborted && active.current === wanted) setLoadingMore(false);
    }
  }, [projectId, cursor, scope, wanted, query]);

  const valid = scope === wanted;
  return {
    conversations: groupProjectAgentTasks(valid ? tasks : []),
    loading, loadingMore, hasMore: valid && Boolean(cursor),
    error, retry, loadMore,
  };
}
