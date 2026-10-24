"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, Loader2, MessageSquareQuote, Paperclip, Pencil, RotateCcw, Sparkles, Square, ThumbsDown, ThumbsUp, X } from "lucide-react";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";
import { clearProjectAgentFileContext, clearProjectAgentView, consumeProjectAgentInitialFiles, consumeProjectAgentInitialPrompt, getProjectAgentFileContext, getProjectAgentViewId, NEW_PROJECT_AGENT_VIEW_ID, selectProjectAgentView, subscribeToProjectAgentFileEdit, subscribeToProjectAgentView, type ProjectAgentFileContext } from "@/lib/project-agent/view-session";
import { useProjectStore } from "@/stores/useProjectStore";
import { ProjectAgentComposer } from "./ProjectAgentComposer";
import { ProjectAgentHeaderMenu } from "./ProjectAgentHeaderMenu";
import { useCopyResult } from "./useCopyResult";
import { TaskErrorNotice } from "./ProjectAgentErrorNotice";
import { taskIssue } from "@/lib/project-agent/task-issue";
import { ProjectAgentTaskFiles } from "./ProjectAgentTaskFiles";
import { useProjectAgentImageRedo } from "./useProjectAgentImageRedo";
import { ProjectAgentFilePreview } from "./ProjectAgentFilePreview";
import { ProjectAgentOutgoingMessage, type OutgoingMessage } from "./ProjectAgentOutgoingMessage";
import { ProjectAgentReplyProvider } from "./ProjectAgentReply";
import { ProjectAgentQueue } from "./ProjectAgentQueue";
import { ProjectAgentSelectionAsk } from "./ProjectAgentSelectionAsk";
import { ProjectAgentSentAttachments } from "./ProjectAgentSentAttachments";
import { ProjectAgentTimeMarker } from "./ProjectAgentTimeMarker";
import { ProjectAgentTaskDuration } from "./ProjectAgentTaskDuration";
import { ProjectAgentUserText } from "./ProjectAgentUserText";
import { ProjectAgentAttachmentChip } from "./ProjectAgentAttachmentChip";
import { useProjectAgentQueue, type PickedQuote } from "./useProjectAgentQueue";
import { ProjectAgentAskDock } from "./ProjectAgentAskDock";
import { ProjectAgentPlan } from "./ProjectAgentPlan";
import { ProjectAgentGoalBar } from "./ProjectAgentGoalBar";
import { ProjectAgentActivity, ProjectAgentSourceList, extractSources } from "./ProjectAgentActivity";
import { extractAskBlock } from "@/lib/project-agent/rich-ui";
import { inlinedImageNames, resolveInlineImage } from "./projectAgentInlineImages";
import { useProjectAgentConversationSync } from "./useProjectAgentConversationSync";
import { useProjectAgentTaskControls } from "./useProjectAgentTaskControls";
import { useProjectAgentSubmit } from "./useProjectAgentSubmit";
import { ProjectAgentTaskAnswer } from "./ProjectAgentTaskAnswer";
import { ProjectAgentBrowserPreview } from "./ProjectAgentBrowserPreview";
import { ProjectAgentScheduleApproval } from "./ProjectAgentScheduleApproval";
import { AgentProactiveSuggestions } from "./AgentProactiveSuggestions";
import { ProjectAgentScheduleNotifications } from "./ProjectAgentScheduleNotifications";

export function ProjectAgentConversationPane() {
	const projectId = useProjectStore((state) => state.activeProjectId);
	const projectName = useProjectStore((state) => projectId ? state.getProjectById(projectId)?.name : undefined);
	const [viewId, setViewId] = useState<string | null>(null);
	const [tasks, setTasks] = useState<PublicProjectAgentTask[]>([]);
	const [draft, setDraft] = useState("");
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [filesToSave, setFilesToSave] = useState<Set<File>>(new Set());
	const addKnowledgeFile = useProjectStore((state) => state.addKnowledgeFile);
	const [busy, setBusy] = useState(false);
	const queue = useProjectAgentQueue();
	const [quotes, setQuotes] = useState<PickedQuote[]>([]);
	const [reviseSend, setReviseSend] = useState(false);
	useEffect(() => { if (reviseSend && quotes.length) { setReviseSend(false); formRef.current?.requestSubmit(); } }, [reviseSend, quotes]);
	const [loadedViewId, setLoadedViewId] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [loadError, setLoadError] = useState("");
	const [fileContext, setFileContext] = useState<ProjectAgentFileContext | null>(null);
	const endRef = useRef<HTMLDivElement>(null);
	const conversationRef = useRef<HTMLDivElement>(null);
	const shouldFollowRef = useRef(true);
	const formRef = useRef<HTMLFormElement>(null);
	const initialPromptRef = useRef<string | null>(null);
	const regeneratePromptRef = useRef<string | null>(null);
	const retryTaskIdRef = useRef<string | null>(null);
	const [outgoing, setOutgoing] = useState<OutgoingMessage | null>(null);
	const skipPendingRef = useRef(false);
	const [dismissedAskId, setDismissedAskId] = useState<string | null>(null);
	const { copiedTaskId, copyResult } = useCopyResult(setError);
	const { stopTask, setFeedback } = useProjectAgentTaskControls(projectId, setTasks, setError);
	async function skipTask(task: PublicProjectAgentTask) {
		if (await stopTask(task)) skipPendingRef.current = true;
	}
	function regenerate(task: PublicProjectAgentTask) {
		if (busy) return;
		// Submit immediately with an explicit prompt: the draft state would still be stale inside the submit handler.
		regeneratePromptRef.current = task.userPrompt ?? task.prompt;
		retryTaskIdRef.current = task.attachments?.length ? task.id : null;
		formRef.current?.requestSubmit();
	}
	function replyWith(text: string) {
		if (busy) return;
		regeneratePromptRef.current = text;
		formRef.current?.requestSubmit();
	}
	const fileInputRef = useRef<HTMLInputElement>(null);
	async function steerNow(item: { id: string; text: string }) {
		const running = tasks.find((task) => task.status === "running" || task.status === "queued");
		if (!running || !projectId) return;
		try {
			const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(running.id)}/steer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: item.text }) });
			if (response.status === 409) return; // finished a moment ago: it stays queued and goes out as the next message
			if (!response.ok) { setError(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Could not add your message to the running task."); return; }
			queue.remove(item.id);
		} catch { setError("Could not add your message. Check your connection."); }
	}
	const fileHref = (task: PublicProjectAgentTask, file: NonNullable<PublicProjectAgentTask["files"]>[number]) => file.savedToProjectFileId ? `/api/projects/${encodeURIComponent(projectId!)}/knowledge/original?fileId=${encodeURIComponent(file.savedToProjectFileId)}` : `/api/projects/${encodeURIComponent(projectId!)}/agent/tasks/${encodeURIComponent(task.id)}/files/${encodeURIComponent(file.id)}`;
	// Typing /compact still works; its entry stays hidden like automatic compaction.
	const addCompactedEntry = (task: PublicProjectAgentTask) => { setError(""); setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]); };
	const redoImage = useProjectAgentImageRedo(pendingFiles, setPendingFiles, regeneratePromptRef, formRef);
	useEffect(() => {
		if (!projectId) { setViewId(null); return; }
		const sync = () => setViewId(getProjectAgentViewId(projectId));
		sync();
		return subscribeToProjectAgentView(projectId, sync);
	}, [projectId]);

	useEffect(() => {
		if (!projectId) { setFileContext(null); return; }
		const sync = () => setFileContext(getProjectAgentFileContext(projectId));
		sync();
		return subscribeToProjectAgentView(projectId, sync);
	}, [projectId]);

	const { hasOlder, loadingOlder, loadOlder } = useProjectAgentConversationSync(projectId, viewId, setTasks, setLoadedViewId, setLoadError);

	useEffect(() => {
		if (!projectId || viewId !== NEW_PROJECT_AGENT_VIEW_ID) return;
		const initialPrompt = initialPromptRef.current ?? consumeProjectAgentInitialPrompt(projectId);
		const initialFiles = consumeProjectAgentInitialFiles(projectId);
		if (initialFiles.length) setPendingFiles(initialFiles);
		if (!initialPrompt) return;
		initialPromptRef.current = initialPrompt;
		setDraft(initialPrompt);
		const frame = window.requestAnimationFrame(() => formRef.current?.requestSubmit());
		return () => window.cancelAnimationFrame(frame);
	}, [projectId, viewId]);

	const orderedTasks = useMemo(() => [...tasks].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)), [tasks]);
	const activeFileContext = fileContext && (fileContext.conversationId === viewId || orderedTasks.some((task) => task.id === fileContext.taskId && (task.conversationId ?? task.id) === viewId)) ? fileContext : null;
	const latestTask = orderedTasks.at(-1);
	const pendingAsk = latestTask && latestTask.status === "done" && dismissedAskId !== latestTask.id && !busy && latestTask.resultText ? extractAskBlock(latestTask.resultText) : null;
	useEffect(() => {
		if (!skipPendingRef.current || !latestTask || latestTask.status === "running" || latestTask.status === "queued" || busy) return;
		skipPendingRef.current = false;
		if (latestTask.status !== "done") replyWith("Skip any further searching or reading. Answer now using only what you have already found, and say what is still missing.");
	}, [latestTask?.status, latestTask?.id, busy]);
	const chatTitle = [...orderedTasks].reverse().find((task) => task.chatTitle)?.chatTitle
		?? orderedTasks[0]?.userPrompt
		?? orderedTasks[0]?.prompt
		?? "Project Agent";
	const headerTitle = chatTitle.split(/\r?\n/, 1)[0].replace(/\s+/g, " ").trim();
	const visibleHeaderTitle = headerTitle.length > 84 ? `${headerTitle.slice(0, 81).trimEnd()}…` : headerTitle;
	useEffect(() => {
		if (!activeFileContext) return;
		const frame = window.requestAnimationFrame(() => formRef.current?.querySelector("textarea")?.focus());
		return () => window.cancelAnimationFrame(frame);
	}, [activeFileContext?.fileId, activeFileContext?.pageNumber]);
	// Submit only for a fresh viewer action, not when a saved request is restored after reload.
	useEffect(() => {
		if (!projectId) return;
		return subscribeToProjectAgentFileEdit(projectId, () => { window.requestAnimationFrame(() => formRef.current?.requestSubmit()); });
	}, [projectId]);
	// Tell the user when a long task finishes while they are in another tab or app.
	const lastSeenRef = useRef<{ id: string; status: string } | null>(null);
	useEffect(() => {
		if (!latestTask) return;
		const previous = lastSeenRef.current;
		lastSeenRef.current = { id: latestTask.id, status: latestTask.status };
		const finished = latestTask.status === "done" || latestTask.status === "failed";
		if (!previous || previous.id !== latestTask.id || !(previous.status === "running" || previous.status === "queued") || !finished) return;
		// The agent may have saved sources, runbook notes or its work log while running.
		if (projectId) void useProjectStore.getState().refreshProject(projectId);
		if (typeof document === "undefined" || !document.hidden) return;
		const originalTitle = document.title;
		document.title = `${latestTask.status === "done" ? "Done" : "Failed"} - ${originalTitle}`;
		const restore = () => { if (!document.hidden) { document.title = originalTitle; document.removeEventListener("visibilitychange", restore); } };
		document.addEventListener("visibilitychange", restore);
		try {
			if ("Notification" in window && Notification.permission === "granted") {
				new Notification(latestTask.status === "done" ? "Project Agent finished" : "Project Agent could not finish", { body: (latestTask.chatTitle ?? latestTask.userPrompt ?? latestTask.prompt ?? "").slice(0, 120) });
			}
		} catch { /* notifications are optional */ }
	}, [latestTask?.id, latestTask?.status]);
	useEffect(() => {
		if (shouldFollowRef.current) endRef.current?.scrollIntoView({ behavior: latestTask?.status === "running" ? "auto" : "smooth" });
	}, [latestTask?.partialText?.length, latestTask?.resultText?.length, latestTask?.status, orderedTasks.length]);
	useEffect(() => {
		if (busy || !queue.items.length || !formRef.current) return;
		const next = queue.items[0];
		queue.remove(next.id);
		setPendingFiles(next.files);
		regeneratePromptRef.current = next.text;
		const frame = window.requestAnimationFrame(() => formRef.current?.requestSubmit());
		return () => window.cancelAnimationFrame(frame);
	}, [busy, queue.items.length]);
	const send = useProjectAgentSubmit({ retryTaskIdRef, setOutgoing, projectId, viewId, orderedTasks, draft, pendingFiles, filesToSave, quotes, activeFileContext, busy, queue, addKnowledgeFile, initialPromptRef, regeneratePromptRef, shouldFollowRef, setBusy, setDraft, setError, setFilesToSave, setPendingFiles, setQuotes, setTasks, onCompacted: addCompactedEntry });
	if (!projectId || !viewId) return null;

	return <ProjectAgentReplyProvider value={busy ? null : replyWith}><section className="flex h-full min-h-0 flex-col" aria-label="Project Agent conversation">
		<ProjectAgentSelectionAsk containerRef={conversationRef} onRevise={(text, instruction, title) => { setQuotes([{ text, note: `Revise only this passage of the draft${title ? ` "${title}"` : ""}: ${instruction}. Keep everything else unchanged and return the complete updated draft as a new Writing block.` }]); setReviseSend(true); }} onQuote={(text, note) => { setQuotes((current) => [...current, { text, note }].slice(-6)); window.requestAnimationFrame(() => formRef.current?.querySelector("textarea")?.focus()); }} />
		<header className="sticky top-0 z-10 shrink-0 border-b border-slate-200/80 bg-white/90 px-5 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
			<div className="mx-auto flex max-w-3xl items-center gap-3">
				<button type="button" onClick={() => clearProjectAgentView(projectId)} aria-label="Back to Project chats" title="Back to Project chats" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><ArrowLeft className="h-4 w-4" /></button><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-300"><Sparkles className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-xs text-slate-500">{projectName}</p><p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100" title={chatTitle}>{visibleHeaderTitle || "Project Agent"}</p></div><ProjectAgentScheduleNotifications /><ProjectAgentHeaderMenu projectId={projectId!} tasks={orderedTasks} fileUrl={fileHref} />
			</div>
		</header>
		<div ref={conversationRef} data-selectable-chat onScroll={(event) => { const element = event.currentTarget; shouldFollowRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120; }} className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8">
			{hasOlder && viewId !== NEW_PROJECT_AGENT_VIEW_ID && <div className="mx-auto mb-5 flex max-w-3xl justify-center"><button type="button" disabled={loadingOlder} onClick={() => { shouldFollowRef.current = false; void loadOlder(); }} className="rounded-full border border-slate-200 px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">{loadingOlder ? "Loading earlier messages…" : "Load earlier messages"}</button></div>}
			{orderedTasks.length === 0 && viewId !== NEW_PROJECT_AGENT_VIEW_ID && loadedViewId !== viewId && !error && !loadError && <div className="flex justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-label="Loading chat" /></div>}
			{hasOlder && orderedTasks.length === 0 && viewId !== NEW_PROJECT_AGENT_VIEW_ID && loadedViewId === viewId && <p role="status" className="mx-auto max-w-xl py-10 text-center text-sm text-slate-500">This chat is older than the loaded history. Choose “Load earlier messages” to continue finding it.</p>}
			{orderedTasks.length === 0 && !hasOlder && !outgoing && (viewId === NEW_PROJECT_AGENT_VIEW_ID || loadedViewId === viewId || Boolean(error || loadError)) && <div className="mx-auto flex min-h-[min(52vh,520px)] max-w-2xl flex-col items-center justify-center py-10 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-300"><Sparkles className="h-6 w-6" /></div><p className="mt-5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">What would you like to work on?</p><p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">Your Project Agent can use the files and instructions saved in {projectName || "this project"}.</p><div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">{["Summarize project files", "Analyze a document", "Create a report"].map((suggestion) => <button key={suggestion} type="button" onClick={() => { setDraft(suggestion); requestAnimationFrame(() => formRef.current?.querySelector("textarea")?.focus()); }} className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">{suggestion}</button>)}</div></div>}
			{orderedTasks.filter((task) => task.userPrompt !== "/compact").map((task, index, visibleTasks) => <div key={task.id}>
				<ProjectAgentTimeMarker timestamp={task.createdAt} previousTimestamp={visibleTasks[index - 1]?.createdAt} />
				<article className="mx-auto w-full max-w-3xl space-y-5 pb-5">
				<div className="ml-auto max-w-[90%] rounded-[24px] rounded-br-md bg-slate-100 px-5 py-3.5 text-[15px] leading-7 text-slate-800 dark:bg-slate-800 dark:text-slate-100 sm:max-w-[82%]">
					<ProjectAgentSentAttachments projectId={projectId} taskId={task.id} files={task.attachments} /><div className="space-y-1"><ProjectAgentUserText text={task.userPrompt ?? task.prompt} /></div>{task.steerNotes?.map((note, index) => <p key={index} className="mt-2 whitespace-pre-wrap border-t border-slate-200 pt-2 text-[14px] text-slate-600 dark:border-slate-700 dark:text-slate-300"><span className="mr-1 text-xs font-medium uppercase tracking-wide text-slate-400">Added while working</span><br />{note}</p>)}{task.canContinue && task.id === orderedTasks.at(-1)?.id && task.status !== "running" && task.status !== "queued" && <button type="button" onClick={() => { setDraft(task.userPrompt ?? task.prompt); window.requestAnimationFrame(() => formRef.current?.querySelector("textarea")?.focus()); }} aria-label="Edit message" title="Edit message and send again" className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700"><Pencil className="h-3 w-3" />Edit</button>}
				</div>
				<div className="max-w-full px-1 py-1 text-[15px] leading-7 text-slate-800 dark:text-slate-100">
					{task.plan?.length ? <ProjectAgentPlan language={task.activityLanguage} items={task.plan} running={task.status === "running" || task.status === "queued"} /> : null}
					<ProjectAgentTaskDuration task={task} />
					<ProjectAgentActivity language={task.activityLanguage} progress={task.progress} imageBase={`/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(task.id)}/renders/`} activity={task.activity ?? []} running={task.status === "running" || task.status === "queued"} sources={extractSources(task.resultText)} onSkip={task.canContinue ? () => void skipTask(task) : undefined} />
					{task.canContinue && (((task.status === "running" || task.status === "queued") && task.browserAvailable) || task.browserUsed) && <ProjectAgentBrowserPreview projectId={projectId} taskId={task.id} running={task.status === "running" || task.status === "queued"} language={task.activityLanguage} />}
					{task.status === "failed" && (task.files?.length || task.resultText) ? <p role="status" className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-300">{task.activityLanguage === "vi" ? "Bản nháp chưa xác minh — kiểm tra trước khi sử dụng" : "Unverified draft — inspect before use"}</p> : null}
					{task.resultText || (task.partialText && task.status === "running") ? <ProjectAgentTaskAnswer language={task.activityLanguage} markdown={task.resultText ?? task.partialText ?? ""} sources={task.sources ?? []} resolveImage={(src) => resolveInlineImage(src, task.files, (file) => fileHref(task, file))} presentation={task.status === "done"} running={task.status === "running"} onStop={() => void stopTask(task)} /> : (task.status === "queued" || task.status === "running") ? <p className="flex flex-wrap items-center gap-2 text-slate-500">{task.activity?.length ? null : <><Loader2 className="h-4 w-4 animate-spin" /><span>{task.progress ?? "Project Agent is working…"}</span></>}{task.canContinue && <button type="button" onClick={() => void stopTask(task)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:px-4 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><Square className="h-3 w-3" />Stop</button>}</p> : null}
					{task.resultText && <ProjectAgentSourceList markdown={task.resultText} sources={task.sources} />}
					{task.error && !(task.status === "done" && task.resultText) && <TaskErrorNotice error={task.error} cancelled={Boolean(task.cancelled)} language={task.activityLanguage} />}
					{task.status === "failed" && task.canContinue && task.id === orderedTasks.at(-1)?.id && !taskIssue(task.error ?? "")?.needsReview && <button type="button" disabled={busy} onClick={() => regenerate(task)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 [@media(pointer:coarse)]:min-h-10 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><RotateCcw className="h-3.5 w-3.5" />{task.cancelled ? "Run again" : "Try again"}</button>}
					{(task.status === "done" || task.status === "failed") && <div className="mt-2 flex items-center gap-1 text-slate-400">{task.resultText && <button type="button" onClick={() => void copyResult(task)} aria-label="Copy response" title="Copy response" className="rounded-md p-1.5 [@media(pointer:coarse)]:p-2.5 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">{copiedTaskId === task.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button>}{task.status === "done" && task.canContinue && task.id === orderedTasks.at(-1)?.id && <button type="button" disabled={busy} onClick={() => regenerate(task)} aria-label="Regenerate response" title="Regenerate response" className="rounded-md p-1.5 [@media(pointer:coarse)]:p-2.5 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-slate-800"><RotateCcw className="h-4 w-4" /></button>}{task.resultText && task.canContinue && <><button type="button" onClick={() => void setFeedback(task, "like")} aria-label="Good response" aria-pressed={task.feedback === "like"} title="Good response" className={`rounded-md p-1.5 [@media(pointer:coarse)]:p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 ${task.feedback === "like" ? "text-emerald-600" : "hover:text-slate-700"}`}><ThumbsUp className="h-4 w-4" /></button><button type="button" onClick={() => void setFeedback(task, "dislike")} aria-label="Bad response" aria-pressed={task.feedback === "dislike"} title="Bad response" className={`rounded-md p-1.5 [@media(pointer:coarse)]:p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 ${task.feedback === "dislike" ? "text-red-600" : "hover:text-slate-700"}`}><ThumbsDown className="h-4 w-4" /></button></>}</div>}
					<ProjectAgentTaskFiles projectId={projectId!} chatTasks={orderedTasks} task={task} viewId={viewId} busy={busy} onRedo={redoImage} fileHref={fileHref} inlined={inlinedImageNames(task.resultText, task.files)} />
				</div>
				</article>
			</div>)}
			{outgoing && <ProjectAgentOutgoingMessage message={outgoing} />}
			<div ref={endRef} className="h-px" />
			{error && <p role="alert" className="mx-auto max-w-3xl text-sm text-red-600">{error}</p>}
			{loadError && <p role="alert" className="mx-auto max-w-3xl text-sm text-amber-700 dark:text-amber-300">Could not refresh this chat: {loadError}. Retrying…</p>}
		</div>
		<div className="shrink-0 border-t border-slate-200/70 bg-white/90 px-3 pb-1 pt-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 sm:px-6 sm:pb-4 sm:pt-3">
			<input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => { const picked = Array.from(event.target.files ?? []); event.target.value = ""; if (picked.length) setPendingFiles((current) => [...current, ...picked]); }} />
			{pendingAsk && latestTask ? <div className="px-4 pt-2"><ProjectAgentAskDock key={latestTask.id} ask={pendingAsk} onSubmit={replyWith} onDismiss={() => setDismissedAskId(latestTask.id)} /></div> : null}
			<ProjectAgentScheduleApproval projectId={projectId} />
            <AgentProactiveSuggestions projectId={projectId} />
            <ProjectAgentQueue items={queue.items} canSteer={Boolean(latestTask && (latestTask.status === "running" || latestTask.status === "queued") && latestTask.canContinue)} onSteer={(item) => void steerNow(item)} onRemove={queue.remove} />
			{viewId !== NEW_PROJECT_AGENT_VIEW_ID && projectId ? <div className="px-4 pb-2"><ProjectAgentGoalBar projectId={projectId} conversationId={latestTask?.conversationId ?? viewId} /></div> : null}
			<ProjectAgentComposer footnote="AI can make mistakes. Check key info." value={draft} onChange={setDraft} onSubmit={(event) => void send(event)} onAttach={() => fileInputRef.current?.click()} onFiles={(picked) => setPendingFiles((current) => [...current, ...picked])} placeholder={activeFileContext ? `Ask for a change to ${activeFileContext.fileName}${activeFileContext.pageNumber ? ` · page ${activeFileContext.pageNumber}` : ""}…` : "Message Project Agent"} ariaLabel="Message Project Agent" formRef={formRef} attachLabel="Add files and images" sendLabel={busy ? "Queue message (sent when the agent finishes)" : "Send to Project Agent"} busy={false} allowEmptyValue={Boolean(activeFileContext) || pendingFiles.length > 0 || quotes.length > 0} attachments={(activeFileContext || pendingFiles.length > 0 || quotes.length > 0) ? <>{quotes.map((quote, index) => <div key={index} className="flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><MessageSquareQuote className="h-3.5 w-3.5 shrink-0" /><span className="max-w-64 min-w-0"><span className="block truncate">{quote.text.replace(/\s+/g, " ")}</span>{quote.note.trim() && <span className="block truncate text-[11px] text-slate-400">{quote.note.trim()}</span>}</span><button type="button" onClick={() => setQuotes((current) => current.filter((_, at) => at !== index))} aria-label="Remove quote" className="rounded-full p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"><X className="h-3.5 w-3.5" /></button></div>)}{activeFileContext && <div className="flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><Paperclip className="h-3.5 w-3.5 shrink-0" /><span className="max-w-48 truncate">{activeFileContext.fileName}{activeFileContext.pageNumber ? ` · page ${activeFileContext.pageNumber}` : ""}</span><button type="button" onClick={() => clearProjectAgentFileContext(projectId)} aria-label="Remove canvas file" className="rounded-full p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"><X className="h-3.5 w-3.5" /></button></div>}{pendingFiles.map((file, index) => <ProjectAgentAttachmentChip key={`${file.name}-${index}`} file={file} onRemove={() => setPendingFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}><label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={filesToSave.has(file)} onChange={(event) => setFilesToSave((current) => { const next = new Set(current); if (event.target.checked) next.add(file); else next.delete(file); return next; })} className="h-3 w-3 accent-orange-600" />Add to project</label></ProjectAgentAttachmentChip>)}</> : undefined} />
			<p className="mx-auto mt-1.5 hidden max-w-3xl text-center text-[11px] text-slate-400 sm:block">Project Agent can make mistakes. Review important information.</p>
		</div>
	</section></ProjectAgentReplyProvider>;
}
