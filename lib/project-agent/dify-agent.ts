import { createHash } from "crypto";
import * as projectCap from "@/lib/capabilities/project";
import { cacheDifyGeneratedFiles, findDifyGeneratedFileLinks, hasUnreachableDifySandboxFileLink } from "./files";
import { uploadProjectAgentTaskInputFiles, uploadProjectKnowledgeFiles, type DifyChatFile } from "./dify-input-files";
import { requiresProjectAgentFileOutput } from "./intent";
import { buildProjectAgentInputReadback } from "./input-file-context";
import { buildVisualReviewFiles, buildVisualReviewQuery, getReviewDecision } from "./deliverable-review";
import { readDifyAgentMessage, type DifyAgentMessage } from "./dify-stream";
import { buildProjectAgentQuery, getProjectAgentKnowledgeText } from "./dify-query";
import { fulfillLargeProjectSourceRequests } from "./large-source-agent-loop";
import { stripProjectSourceReadRequests } from "./large-source-reader";
import { loadDefaultMemoryContext, loadProjectChatContext } from "./project-chat-context";
import { loadProjectAgentTaskContext } from "./task-context";
import type { ProjectAgentTask, ProjectAgentTaskSource } from "./types";
import { resolveDifyConversationId } from "./conversation";
import { autoCompactIfNeeded } from "./auto-compact";
import { readProjectAgentTask, updateProjectAgentTask } from "./task-store";
import { routeModelSelector } from "./runtime/usage-pricing";
import { callDifyWithCalculator, type DifyCalculatorCall } from "./dify-calculator-bridge";
import { buildChatRecap } from "./chat-recap"; import { retryContext } from "./retry-context";
const MAX_VISUAL_REVIEW_PASSES = 4;
export function projectAgentDifyUser(ownerEmail: string, projectId: string): string {
	return `project_${createHash("sha256").update(`${ownerEmail.trim().toLowerCase()}:${projectId}`).digest("hex").slice(0, 24)}`;
}
export function getEndpoint(): string {
	const configured = process.env.PROJECT_AGENT_DIFY_API_URL?.trim();
	if (!configured) throw new Error("PROJECT_AGENT_DIFY_API_URL is not configured");
	const url = new URL(configured);
	const path = url.pathname.replace(/\/+$/, "");
	url.pathname = path.endsWith("/chat-messages")
		? path
		: `${path.endsWith("/v1") ? path : `${path}/v1`}/chat-messages`;
	return url.toString();
}
import { extractAgentSideEffects, hideAgentTags, describeTaskWork, loadRunbookPrompt, removeAgentWebSources, saveAgentWebSources, saveRunbookNotes, saveTaskWorkLog, type AgentWebSource } from "./agent-sources";
import { PROJECT_AGENT_BOOT_ID } from "./boot"; import { loadProjectSkillSet, stripProjectSkillReadRequests } from "./project-skills";
import { personalMemoryPrompt } from "./personal-agent-memory"; import { personalSkillsPrompt } from "./personal-agent-skills";
import { buildReferenceReview } from "./reference-review"; import { isRuntimeEnabled, runRuntimeAgent } from "./runtime/run-agent";
import { attachHarnessToQuery } from "./harness-lab/attach";
import { redactSecrets } from "./runtime/policy"; import { newDirectState } from "./runtime/workspace-direct-apply";
import { cancelTaskWorkspaceTurns } from "./runtime/workspace-direct";
import { workspaceSaveReporter } from "./runtime/workspace-task-progress";
import { describeWorkspace } from "./runtime/prepare";
import { stageInputs } from "./runtime/stage";
import { buildLintFixQuery, lintDeliverables, uploadLintSheets, MAX_LOCAL_FIX_ROUNDS } from "./deterministic-review";
import { hideRichFileBlocks, stripUnverifiedDisclaimers } from "./rich-files";
import { lessonsForTask, lessonsPrompt, recordLessonCandidates } from "./learning/global-lessons";
import { reflectOnTask } from "./learning/reflect";
import { retainProjectHindsight } from "./hindsight/memory"; import { loadAgentSearchContext } from "./xerj/agent-context";
const DIFY_MAX_FILES_PER_MESSAGE = Math.max(1, Number(process.env.PROJECT_AGENT_DIFY_MAX_FILES) || 3);
export { buildProjectAgentQuery, PROJECT_AGENT_DELIVERABLE_QUALITY_GATE } from "./dify-query";
export { readDifyAgentAnswer, readDifyAgentMessage } from "./dify-stream";
export function isProjectAgentDifyConfigured(): boolean {
	return Boolean(process.env.PROJECT_AGENT_DIFY_API_URL?.trim() && process.env.PROJECT_AGENT_DIFY_API_KEY?.trim());
}
const isBrokenConversationError = (cause: unknown) => /maximum output retries|conversation.*(not exist|invalid)/i.test(cause instanceof Error ? cause.message : String(cause));
export async function runProjectAgentTask(taskId: string, signal?: AbortSignal): Promise<ProjectAgentTask> {
	const task = await readProjectAgentTask(taskId);
	if (!task) throw new Error(`Project Agent task not found: ${taskId}`);
	let latestFiles: ProjectAgentTask["files"] = [];
	let latestAnswer = "";
	let wroteLesson = false; // reflect: fire-and-forget cheap-model lesson after the final status
	const reflect = (finalTask: ProjectAgentTask) => { void reflectOnTask({ task: finalTask, user: projectAgentDifyUser(task.ownerEmail, task.projectId), wroteLesson, log: (logLine) => updateProjectAgentTask(task.id, { logLine }) }).catch(() => {}); return finalTask; };
	let runtimeSources: ProjectAgentTaskSource[] = [];
	let partialQueue: Promise<void> = Promise.resolve();
	const threadId = task.conversationId;
	const runtime = isRuntimeEnabled();
	let conversationId = (runtime ? undefined : await autoCompactIfNeeded(task)) ?? await resolveDifyConversationId(task);
	const conversationPatch = (difyId?: string) => difyId ? { conversationId: threadId ?? difyId, ...(threadId && difyId !== threadId ? { difyConversationId: difyId } : {}) } : {};
	try {
		const apiKey = process.env.PROJECT_AGENT_DIFY_API_KEY?.trim();
		if (!apiKey) throw new Error("PROJECT_AGENT_DIFY_API_KEY is not configured");
		const endpoint = getEndpoint();
		const projectAccess = await projectCap.getProjectAccess(task.projectId, task.ownerEmail);
		if (!projectAccess) throw new Error("Project access was removed before the task could run");
		const projectOwnerEmail = projectAccess.ownerEmail;
		await updateProjectAgentTask(task.id, { status: "running", bootId: PROJECT_AGENT_BOOT_ID, startedAt: new Date().toISOString(), logLine: "app_stage :: loading_context" });
		const [knowledge, projectChats, projectAgentHistory, personalChats] = await Promise.all([
			getProjectAgentKnowledgeText(task.projectId, projectOwnerEmail, task.prompt, runtime),
			loadProjectChatContext(task.projectId, task.ownerEmail, task.userPrompt ?? task.prompt),
			loadProjectAgentTaskContext(task.projectId, task.ownerEmail, task.id, task.userPrompt ?? task.prompt),
			loadDefaultMemoryContext(task.projectId, task.ownerEmail),
		]);
		const { hindsightMemory, xerjContext } = await loadAgentSearchContext({ projectId: task.projectId, query: task.userPrompt ?? task.prompt, signal, log: (detail) => { void updateProjectAgentTask(task.id, { logLine: detail }).catch(() => {}); } });
		const user = projectAgentDifyUser(task.ownerEmail, task.projectId);
		await updateProjectAgentTask(task.id, { logLine: "app_stage :: preparing_inputs" });
		const taskInputs = await uploadProjectAgentTaskInputFiles(task.inputFiles ?? [], task.id, user, endpoint, apiKey);
		const inputReadback = await buildProjectAgentInputReadback(task.inputFiles ?? [], task.id, runtime ? 12_000 : undefined, { email: task.ownerEmail, projectId: task.projectId }, signal);
		const projectFiles = await uploadProjectKnowledgeFiles(projectAccess.project.knowledgeFiles, user, endpoint, apiKey, {
			maxFiles: Math.max(0, DIFY_MAX_FILES_PER_MESSAGE - taskInputs.files.length),
			maxTotalBytes: Math.max(0, 30 * 1024 * 1024 - taskInputs.totalBytes),
		});
		// Dify rejects a message with more files than its per-message limit; the upload read-back still gives the agent the text of every input.
		const attached = {
			files: [...taskInputs.files, ...projectFiles.files].slice(0, DIFY_MAX_FILES_PER_MESSAGE),
			names: [...taskInputs.names, ...projectFiles.names].slice(0, DIFY_MAX_FILES_PER_MESSAGE),
		};
		let lastPartialAt = 0;
		const onPartial = (answerSoFar: string, toolName?: string, step?: { id: string; detail: string; phase?: "started" | "returned" }) => {
			const now = Date.now();
			if (!toolName && now - lastPartialAt < 1_000) return;
			if (!toolName) lastPartialAt = now;
			partialQueue = partialQueue.then(() => updateProjectAgentTask(task.id, {
				...(answerSoFar && !toolName ? { partialText: stripProjectSkillReadRequests(stripProjectSourceReadRequests(hideAgentTags(hideRichFileBlocks(answerSoFar)))).slice(-20_000) } : {}),
				...(toolName ? { logLine: step?.phase === "returned" ? `tool returned ${toolName} #${step.id.slice(0, 12)}` : `using tool ${toolName}${step ? ` #${step.id.slice(0, 12)}${step.detail ? ` :: ${redactSecrets(step.detail).replace(/\s+/g, " ").slice(0, 120)}` : ""}` : ""}` } : {}),
			})).then(() => {}).catch(() => {});
		};
		const classicTurn = (request: DifyCalculatorCall) => callDifyWithCalculator({ ...request, originalRequest: task.userPrompt ?? task.prompt, calculatorEnabled: !projectAccess.project.disabledToolGroups?.includes("code"), onBridgeEvent: (tool, detail) => updateProjectAgentTask(task.id, { logLine: `using tool ${tool} :: ${detail.replace(/\s+/g, " ").slice(0, 200)}` }) });
		const skillSet = await loadProjectSkillSet(projectAccess.project.skillIds, projectAccess.ownerEmail);
    const personalMemory = await personalMemoryPrompt(task.ownerEmail); if (personalMemory) skillSet.context += "\n\n" + personalMemory;
    const crossProjectSkills = await personalSkillsPrompt(task.ownerEmail); if (crossProjectSkills) skillSet.context += "\n\n" + crossProjectSkills;
		let savedSources: AgentWebSource[] = [];
		const priorRetry = task.retryOfTaskId ? await readProjectAgentTask(task.retryOfTaskId).catch(() => null) : null;
		const retryBrief = priorRetry && priorRetry.ownerEmail === task.ownerEmail && priorRetry.projectId === task.projectId
			? retryContext(priorRetry) : "";
		const firstCall = {
			endpoint, apiKey, user, signal, onPartial, editSources: { taskId: task.id, files: task.inputFiles ?? [] },
			query: buildProjectAgentQuery(task, projectAccess.project, knowledge, attached.names, projectChats, projectAgentHistory, personalChats, inputReadback, skillSet.context, await loadRunbookPrompt(task.projectId, projectOwnerEmail), false, hindsightMemory, xerjContext) + (retryBrief ? "\\n\\n" + retryBrief : ""),
			files: attached.files,
		};
		// PROJECT_AGENT_RUNTIME=sandbox: the app runs the agent loop in a Docker sandbox; Dify only supplies the model step.
		const chatKey = threadId ?? task.id;
		const workspaceState = newDirectState();
		const onWorkspaceSaved = workspaceSaveReporter(task.id);
		const runtimeTurn = async (query: string): Promise<DifyAgentMessage> => {
			const message = await runRuntimeAgent({
				workspaceState, sources: runtimeSources, chatId: chatKey, taskId: task.id, projectId: task.projectId, user, ownerEmail: task.ownerEmail, scheduledRun: Boolean(task.scheduleRunId || task.workflowRunId), engines: task.engines, modelSelector: task.modelSelector || routeModelSelector(task.userPrompt ?? task.prompt), recoverChatContext: () => buildChatRecap(task), userPrompt: task.userPrompt ?? task.prompt, onBoard: (boardId) => { void updateProjectAgentTask(task.id, { workspaceBoardId: boardId }).catch(() => {}); }, boardId: task.boardId, onWorkspaceSaved, query, conversationId, signal,
				onStep: (step) => { void updateProjectAgentTask(task.id, { logLine: step.tool === "model_step" ? `thinking :: ${step.detail}` : step.tool === "metrics" ? `metrics :: ${step.detail}` : step.tool === "trajectory" ? `trajectory :: ${step.detail}` : step.tool === "plan" ? `plan :: ${step.detail.slice(0, 1800)}` : step.tool === "tool_failed" ? `tool failed :: ${step.detail}` : step.tool === "progress_message" ? `progress_message :: ${step.detail.replace(/\s+/g, " ").slice(0, 240)}` : `using tool ${step.tool} :: ${step.detail.replace(/\s+/g, " ").slice(0, 200)}` }).catch(() => {}); },
				onConversation: (id) => { conversationId = id; void updateProjectAgentTask(task.id, conversationPatch(id)).catch(() => {}); },
			});
			runtimeSources = message.sources ?? runtimeSources;
			return message;
		};
		if (runtime) {
			const staged = await stageInputs(task, chatKey, projectOwnerEmail);
			const runbookText = await loadRunbookPrompt(task.projectId, projectOwnerEmail);
			const learned = await lessonsForTask(task.id).catch(() => []);
			if (learned.length) void updateProjectAgentTask(task.id, { logLine: `learned :: ${learned.map((lesson) => lesson.id).join(",")}` }).catch(() => {});
			firstCall.query = `${buildProjectAgentQuery(task, projectAccess.project, knowledge, attached.names, projectChats, projectAgentHistory.slice(0, 3_000), personalChats, inputReadback, skillSet.context, [runbookText, lessonsPrompt(learned)].filter(Boolean).join("\n\n"), true, hindsightMemory, xerjContext)}\n\nFiles staged in /work/inputs: ${staged.length ? staged.join(", ") : "(none)"}${await describeWorkspace(task.projectId, chatKey, staged).then((text) => text ? `\n\n${text}` : "").catch(() => "")}`;
			void updateProjectAgentTask(task.id, { logLine: `context :: query_chars=${firstCall.query.length} knowledge=${knowledge.length} project_chats=${projectChats.length} default_memory=${personalChats.length} agent_history=${projectAgentHistory.length} readback=${inputReadback.length} skills=${skillSet.context.length} runbook=${String(runbookText ?? "").length}` }).catch(() => {});
		}
    if (retryBrief && runtime) firstCall.query += "\\n\\n" + retryBrief;
    firstCall.query = await attachHarnessToQuery(task, firstCall.query,
      line => updateProjectAgentTask(task.id, { logLine: line }));
		await updateProjectAgentTask(task.id, { logLine: "app_stage :: processing_request" });
		let message = await (runtime ? runtimeTurn(firstCall.query) : classicTurn({ ...firstCall, conversationId })).catch(async (cause) => {
			// A Dify conversation left in a broken state (e.g. after an aborted tool round) fails every later turn;
			// the query already carries the chat history, so start a fresh conversation instead of failing the chat.
			if (runtime || !conversationId || signal?.aborted || !isBrokenConversationError(cause)) throw cause;
			await updateProjectAgentTask(task.id, { logLine: "continuing in a fresh Dify conversation (the previous one failed)" }).catch(() => {});
			conversationId = undefined;
			return classicTurn({ ...firstCall, conversationId: undefined });
		});
		message = await fulfillLargeProjectSourceRequests({
			message, originalTask: task.userPrompt ?? task.prompt,
			files: projectAccess.project.knowledgeFiles,
			user,
			ownerEmail: task.ownerEmail,
			projectId: task.projectId,
			signal,
			endpoint,
			apiKey,
			readSkill: skillSet.read,
			onRead: (fileName) => { void updateProjectAgentTask(task.id, { logLine: `reading Project source ${fileName}` }).catch(() => {}); },
			continueDify: (next) => classicTurn({ endpoint, apiKey, user, signal, onPartial, ...next }),
		});
		conversationId = message.conversationId ?? conversationId;
		const sideEffects = extractAgentSideEffects(message.answer);
		message = { ...message, answer: sideEffects.answer };
		savedSources = sideEffects.sources; wroteLesson = sideEffects.notes.some((note) => note.op === "add" && /^lesson:/i.test(note.text.trim()));
		await Promise.allSettled([saveAgentWebSources(task.projectId, projectOwnerEmail, sideEffects.sources), saveRunbookNotes(task.projectId, projectOwnerEmail, sideEffects.notes), removeAgentWebSources(task.projectId, projectOwnerEmail, sideEffects.removedUrls), recordLessonCandidates(sideEffects.notes.flatMap((note) => note.op === "add" ? [note.text] : []), task.projectId)]);
		if (conversationId) await updateProjectAgentTask(task.id, conversationPatch(conversationId));
		await partialQueue; await updateProjectAgentTask(task.id, { logLine: "app_stage :: checking_output" });
		let cached = await cacheDifyGeneratedFiles(message.answer, task.id, task.projectId, endpoint, apiKey, message.inlineFiles);
		// Content saved to the Workspace board in this task is the deliverable; the file rule only applies when nothing reached the board.
		if (requiresProjectAgentFileOutput(task.prompt) && cached.files.length === 0 && workspaceState.saved === 0) {
			const fileAccessIssue = hasUnreachableDifySandboxFileLink(message.answer, new URL(endpoint).origin)
				? " Dify returned a localhost:5001 sandbox URL; set Dify FILES_URL to a browser-reachable public origin and expose /files through its reverse proxy."
				: "";
			const said = message.answer.trim().replace(/\s+/g, " ");
			const agentReply = said ? ` The agent replied: "${said.length > 600 ? `${said.slice(0, 600)}…` : said}"` : " The agent returned no text.";
			throw new Error(`Dify Project Agent did not return a downloadable file.${fileAccessIssue}${agentReply} The requested file was withheld because it could not be reopened and visually reviewed.`);
		}
		latestAnswer = cached.resultText;
		latestFiles = cached.files;
		const officeVerified = latestFiles.length > 0 && (Boolean(message.officeVerified) || latestFiles.every((file) => file.resource));
		// "local" (default): deterministic checks on the saved bytes, no second model call unless a concrete problem is found.
		// PROJECT_AGENT_REVIEW_MODE=dify restores the model-driven read-back + visual review loop.
		const reviewMode = process.env.PROJECT_AGENT_REVIEW_MODE === "dify" ? "dify" : "local";
		if (reviewMode === "local" && latestFiles.length > 0 && !officeVerified) {
			await updateProjectAgentTask(task.id, { logLine: "checking saved files locally" });
			let compared = false;
			// One look at the template next to the output (the model cannot render files itself), then re-check the result.
			const compareWithTemplate = async () => {
				if (runtime || compared || !latestFiles?.[0] || latestFiles[0].resource) return null;
				const review = await buildReferenceReview(task, latestFiles[0], user, endpoint, apiKey).catch(() => null);
				compared = true;
				if (!review) return null;
				await updateProjectAgentTask(task.id, { logLine: "comparing the output with the template" });
				const answer = await classicTurn({ endpoint, apiKey, user, signal, onPartial, editSources: { taskId: task.id, files: task.inputFiles ?? [] }, query: review.query, files: review.files, conversationId });
				conversationId = answer.conversationId ?? conversationId;
				if (getReviewDecision(answer.answer, answer.inlineFiles.length > 0) !== "revised") return null;
				const replaced = await cacheDifyGeneratedFiles(answer.answer, task.id, task.projectId, endpoint, apiKey, answer.inlineFiles);
				return replaced.files.length ? replaced : null;
			};
			for (let round = 0; ; round += 1) {
				const lints = await lintDeliverables(task.id, latestFiles, task.userPrompt ?? task.prompt);
				const problems = lints.filter((lint) => lint.issues.length > 0);
				if (problems.length === 0) {
					const reviewed = conversationId ? await compareWithTemplate() : null;
					if (reviewed) { latestFiles = reviewed.files; latestAnswer = reviewed.resultText.replace(/^\s*VISUAL_QA_(?:REVISED|PASS)\b[:\s]*/i, ""); round = -1; compared = true; continue; }
					break;
				}
				const summary = problems.map((lint) => `${lint.file}: ${lint.issues.join("; ")}`).join(" | ");
				if (round >= MAX_LOCAL_FIX_ROUNDS || !conversationId) {
					latestAnswer = `${latestAnswer}\n\nAutomated checks still report: ${summary}`.trim();
					break;
				}
				await updateProjectAgentTask(task.id, { logLine: `fixing automated-check problems (round ${round + 1}/${MAX_LOCAL_FIX_ROUNDS}): ${summary.slice(0, 200)}` });
				message = await (runtime ? runtimeTurn(buildLintFixQuery(task, lints, round + 1)) : classicTurn({
					endpoint, apiKey, user, signal, onPartial, editSources: { taskId: task.id, files: task.inputFiles ?? [] },
					query: buildLintFixQuery(task, lints, round + 1),
					files: await uploadLintSheets(problems, user, endpoint, apiKey),
					conversationId,
				}));
				conversationId = message.conversationId ?? conversationId;
				const fixed = await cacheDifyGeneratedFiles(message.answer, task.id, task.projectId, endpoint, apiKey, message.inlineFiles);
				if (fixed.files.length === 0) {
					latestAnswer = `${latestAnswer}\n\nAutomated checks found problems the agent did not fix: ${summary}`.trim();
					break;
				}
				latestFiles = fixed.files;
				latestAnswer = fixed.resultText;
			}
		} else if (latestFiles.length > 0 && conversationId && !officeVerified) {
			await updateProjectAgentTask(task.id, { ...conversationPatch(conversationId), logLine: "starting saved-file read-back and visual review" });
			for (let pass = 1; pass <= MAX_VISUAL_REVIEW_PASSES; pass += 1) {
				await updateProjectAgentTask(task.id, { logLine: `reviewing saved deliverables (pass ${pass}/${MAX_VISUAL_REVIEW_PASSES})` });
				const review = await buildVisualReviewFiles(latestFiles, task.id, user, endpoint, apiKey);
				message = await classicTurn({
					endpoint, apiKey, user, signal,
					query: buildVisualReviewQuery(task, projectAccess.project, knowledge, review.reviews, pass),
					files: review.files,
					conversationId,
				});
				conversationId = message.conversationId ?? conversationId;
				const hasReplacementFile = message.inlineFiles.length > 0 || findDifyGeneratedFileLinks(message.answer, new URL(endpoint).origin).length > 0;
				const decision = getReviewDecision(message.answer, hasReplacementFile);
				if (decision === "pass") {
					const reviewSummary = message.answer.replace(/\bVISUAL_QA_PASS\b/, "").replace(/[*`#]/g, "").trim();
					latestAnswer = `${latestAnswer}\n\nVisual and source-file review: ${reviewSummary}`.trim();
					break;
				}
				if (decision !== "revised") throw new Error("Dify Project Agent did not return a valid visual-review decision; the latest file is available as an unverified draft");
				cached = await cacheDifyGeneratedFiles(message.answer, task.id, task.projectId, endpoint, apiKey, message.inlineFiles);
				if (cached.files.length === 0) throw new Error("Dify Project Agent requested a revision but returned no replacement file");
				latestFiles = cached.files;
				latestAnswer = cached.resultText;
				if (pass === MAX_VISUAL_REVIEW_PASSES) {
					throw new Error(`Generated file still needs revision after ${MAX_VISUAL_REVIEW_PASSES} visual-review passes; the latest file is available as an unverified draft`);
				}
			}
		} else if (latestFiles.length > 0 && !officeVerified && reviewMode === "dify") {
			throw new Error("Dify did not return a conversation id; the latest file is available as an unverified draft because visual review could not continue");
		}
		await partialQueue;
		await updateProjectAgentTask(task.id, { logLine: "app_stage :: saving_results" });
		const finished = await readProjectAgentTask(task.id).catch(() => null);
		await saveTaskWorkLog(task.projectId, projectOwnerEmail, describeTaskWork(finished ?? task, latestFiles.map((file) => file.name), savedSources)).catch(() => {});
		return updateProjectAgentTask(task.id, {
			status: "done",
			completedAt: new Date().toISOString(),
			...conversationPatch(conversationId),
			...(message.promptTokens ? { contextTokens: message.promptTokens } : {}),
			resultText: latestAnswer,
			...(runtimeSources.length ? { sources: runtimeSources } : {}),
			files: latestFiles,
			...(latestFiles.length > 0 ? { filesExpireAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() } : {}),
			logLine: "Dify Project Agent completed",
		}).then(async (completed) => { const saved = await retainProjectHindsight(completed); if (saved) void updateProjectAgentTask(task.id, { logLine: "hindsight :: retained completed task" }).catch(() => {}); return reflect(completed); });
	} catch (cause) {
		await partialQueue;
		const cancelled = Boolean(signal?.aborted);
		const message = cancelled ? "Stopped by you." : cause instanceof Error ? cause.message : String(cause);
		return updateProjectAgentTask(task.id, {
			status: "failed",
			...(cancelled ? { cancelled: true } : {}),
			completedAt: new Date().toISOString(),
			...conversationPatch(conversationId),
			...(runtimeSources.length ? { sources: runtimeSources } : {}),
			...(latestFiles.length > 0 ? {
				files: latestFiles,
				filesExpireAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
				...(latestAnswer ? { resultText: latestAnswer } : {}),
			} : {}),
			error: message,
			logLine: `failed: ${message}`,
		}).then(reflect);
	} finally {
		// Board turns this task left running (for example after a crash mid-apply) must refuse a late commit once the task is over.
		await cancelTaskWorkspaceTurns(task.id).catch(() => {});
	}
}