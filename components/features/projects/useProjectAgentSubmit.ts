"use client";

import { useRef } from "react";

import type { Dispatch, FormEvent, MutableRefObject, SetStateAction } from "react";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";
import { runProjectAgentTaskFromClient } from "@/lib/project-agent/client";
import { compactProjectAgentChat } from "@/lib/project-agent/compact-client";
import { clearProjectAgentFileContext, NEW_PROJECT_AGENT_VIEW_ID, selectProjectAgentView, type ProjectAgentFileContext } from "@/lib/project-agent/view-session";
import { parseGoalCommand } from "@/lib/project-agent/goal-prompts";
import { composerDirective, composerModelSelector } from "@/stores/useAgentComposerStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { useProjectAgentQueue, withQuotes, type PickedQuote } from "./useProjectAgentQueue";
import type { OutgoingFile, OutgoingMessage } from "./ProjectAgentOutgoingMessage";

type Queue = ReturnType<typeof useProjectAgentQueue>;
type AddKnowledgeFile = ReturnType<typeof useProjectStore.getState>["addKnowledgeFile"];

interface SubmitOptions {
	projectId: string | null;
	viewId: string | null;
	orderedTasks: PublicProjectAgentTask[];
	draft: string;
	pendingFiles: File[];
	filesToSave: Set<File>;
	quotes: PickedQuote[];
	activeFileContext: ProjectAgentFileContext | null;
	busy: boolean;
	queue: Queue;
	addKnowledgeFile: AddKnowledgeFile;
	initialPromptRef: MutableRefObject<string | null>;
	regeneratePromptRef: MutableRefObject<string | null>;
	retryTaskIdRef?: MutableRefObject<string | null>;
	shouldFollowRef: MutableRefObject<boolean>;
	setBusy: Dispatch<SetStateAction<boolean>>;
	setOutgoing?: Dispatch<SetStateAction<OutgoingMessage | null>>;
	setDraft: Dispatch<SetStateAction<string>>;
	setError: Dispatch<SetStateAction<string>>;
	setFilesToSave: Dispatch<SetStateAction<Set<File>>>;
	setPendingFiles: Dispatch<SetStateAction<File[]>>;
	setQuotes: Dispatch<SetStateAction<PickedQuote[]>>;
	setTasks: Dispatch<SetStateAction<PublicProjectAgentTask[]>>;
	onCompacted: (task: PublicProjectAgentTask) => void;
}

/** Owns the send path so the conversation component can focus on view state and rendering. */
export function useProjectAgentSubmit(options: SubmitOptions) {
	const sendingRef = useRef(false);
	return async function send(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (sendingRef.current && !options.busy) return;
		const { projectId, viewId, activeFileContext } = options;
		if (!projectId || !viewId) return;
		try { if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission(); } catch { /* optional */ }
		const rawPrompt = (options.regeneratePromptRef.current ?? options.initialPromptRef.current ?? options.draft).trim();
		const latestTask = options.orderedTasks.at(-1);
		const goalCommand = parseGoalCommand(rawPrompt);
		if (goalCommand?.kind === "control") {
			if (goalCommand.action === "status") { options.setDraft(""); return; }
			if (!latestTask?.conversationId) { options.setError("Start a chat before changing its goal."); return; }
			sendingRef.current = true;
			try {
				const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/goal?conversationId=${encodeURIComponent(latestTask.conversationId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: goalCommand.action }) });
				if (!response.ok) throw new Error(`Could not update the goal (${response.status})`);
				options.setError(""); options.setDraft("");
			} catch (cause) { options.setError(cause instanceof Error ? cause.message : "Could not update the goal"); }
			finally { sendingRef.current = false; }
			return;
		}
		const typedPrompt = goalCommand?.kind === "set" ? goalCommand.objective : rawPrompt;
		if (/^\/compact$/i.test(typedPrompt) && latestTask?.conversationId) {
			options.regeneratePromptRef.current = null;
			options.setDraft("");
			options.setBusy(true);
			sendingRef.current = true;
			try { options.onCompacted(await compactProjectAgentChat(projectId, latestTask.id)); }
			catch (cause) { options.setError(cause instanceof Error ? cause.message : "Could not compact this chat"); }
			finally { sendingRef.current = false; options.setBusy(false); }
			return;
		}
		options.regeneratePromptRef.current = null;
		const retryOfTaskId = options.retryTaskIdRef?.current ?? undefined;
		if (options.retryTaskIdRef) options.retryTaskIdRef.current = null;
		const asked = typedPrompt || (options.quotes.length && !options.quotes.some((quote) => quote.note.trim()) ? "Explain this." : "");
		const prompt = (options.quotes.length ? withQuotes(asked, options.quotes) : asked) || (options.pendingFiles.length || activeFileContext ? `Review the attached file${options.pendingFiles.length === 1 ? "" : "s"} and help me understand ${options.pendingFiles.length === 1 ? "it" : "them"}.` : "");
		options.initialPromptRef.current = null;
		if (options.busy) {
			if (prompt) { options.queue.enqueue(prompt, [...options.pendingFiles]); options.setDraft(""); options.setQuotes([]); options.setPendingFiles([]); options.setFilesToSave(new Set()); }
			return;
		}
		if (!prompt) return;
		sendingRef.current = true;
		if (options.quotes.length) options.setQuotes([]);
		options.setBusy(true);
		options.setError("");
		options.setDraft("");
		options.shouldFollowRef.current = true;
		const attachedFiles: File[] = [...options.pendingFiles];
		let taskStarted = false;
		try {
			const conversationId = viewId === NEW_PROJECT_AGENT_VIEW_ID ? null : options.orderedTasks.at(-1)?.conversationId ?? null;
			let agentPrompt = prompt;
			if (activeFileContext) {
				const fileUrl = activeFileContext.savedToProjectFileId
					? `/api/projects/${encodeURIComponent(projectId)}/knowledge/original?fileId=${encodeURIComponent(activeFileContext.savedToProjectFileId)}`
					: `/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(activeFileContext.taskId)}/files/${encodeURIComponent(activeFileContext.fileId)}`;
				const response = await fetch(fileUrl);
				if (!response.ok) throw new Error(`Could not attach ${activeFileContext.fileName} to this message`);
				attachedFiles.push(new File([await response.blob()], activeFileContext.fileName, { type: activeFileContext.mimeType }));
				const region = activeFileContext.region ? ` They marked the area from ${activeFileContext.region.x}% to ${activeFileContext.region.x + activeFileContext.region.width}% across and ${activeFileContext.region.y}% to ${activeFileContext.region.y + activeFileContext.region.height}% down that page; change that part.` : "";
				const pageScope = activeFileContext.pageNumber ? `The user selected page ${activeFileContext.pageNumber} in the viewer.${region} Focus the review or requested change on that page unless the user asks for a broader edit.\n\n` : "";
				const request = [activeFileContext.note, prompt].filter((part) => part?.trim()).join("\n");
				agentPrompt = `Revise or discuss the attached Project deliverable ${activeFileContext.fileName} using it as the source of truth.\n\n${pageScope}User request: ${request}\n\nPreserve all unmentioned content and the existing file format. If you revise it, read back the saved result, render and inspect its appearance, fix any issue, and return the updated file with a brief explanation.`;
			}
			const directive = composerDirective();
			if (directive) agentPrompt = `${agentPrompt}\n\n[${directive}]`;
			options.setPendingFiles([]);
			const saving = attachedFiles.filter((file) => options.filesToSave.has(file));
			options.setFilesToSave(new Set());
			const outgoingFiles: OutgoingFile[] = attachedFiles.map((file) => ({ name: file.name, size: file.size, mimeType: file.type, state: saving.includes(file) ? "saving" : "uploading", progress: 0 }));
			options.setOutgoing?.({ prompt, files: outgoingFiles });
			const patchFile = (index: number, change: Partial<OutgoingFile>) => options.setOutgoing?.((current) => current && { ...current, files: current.files.map((item, at) => at === index ? { ...item, ...change } : item) });
			// A file ticked "add to project" goes up once, as a Project source; the task then copies it server-side.
			const sourceFiles: Array<{ projectSourceId: string; name: string; mimeType: string; size: number }> = [];
			const directFiles: File[] = [];
			const directIndexes: number[] = [];
			for (const [index, file] of attachedFiles.entries()) {
				if (!saving.includes(file)) { directFiles.push(file); directIndexes.push(index); continue; }
				try {
					const projectSourceId = await options.addKnowledgeFile(projectId, file, (fraction) => patchFile(index, { progress: fraction }));
					if (!projectSourceId) throw new Error("the project did not report the new source");
					sourceFiles.push({ projectSourceId, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size });
				} catch (cause) {
					options.setError(`Could not add ${file.name} to the project (${cause instanceof Error ? cause.message : "upload failed"}); it is sent with this message only.`);
					directFiles.push(file); directIndexes.push(index); patchFile(index, { state: "uploading", progress: 0 });
				}
			}
			await runProjectAgentTaskFromClient({
				projectId, userPrompt: prompt, prompt: agentPrompt, files: directFiles, sourceFiles, conversationId, ...(retryOfTaskId && !attachedFiles.length ? { retryOfTaskId } : {}),
				onUploadProgress: (index, fraction) => patchFile(directIndexes[index], { state: "uploading", progress: fraction }),
				modelSelector: composerModelSelector(),
				...(goalCommand?.kind === "set" ? { goal: { objective: goalCommand.objective, condition: goalCommand.condition } } : {}),
				onProgress: (task) => {
					taskStarted = true;
					options.setOutgoing?.(null);
					if (task.conversationId || viewId === NEW_PROJECT_AGENT_VIEW_ID) selectProjectAgentView(projectId, task.conversationId ?? task.id);
					options.setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
				},
			});
			if (activeFileContext) clearProjectAgentFileContext(projectId);
		} catch (cause) {
			options.setError(taskStarted
				? "Connection interrupted while checking the running task. Project Agent already started; check chat history before retrying."
				: cause instanceof TypeError || (cause instanceof Error && /failed to fetch|network/i.test(cause.message))
					? "Network error: could not confirm whether your message was sent. Check chat history before retrying."
					: cause instanceof Error ? cause.message : "Could not send this message to Project Agent");
			options.setOutgoing?.(null);
			if (!taskStarted) {
				options.setDraft(prompt);
				options.setPendingFiles(attachedFiles);
			}
		} finally { sendingRef.current = false; options.setBusy(false); }
	};
}
