import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { signWorkspaceAgentUserToken } from "@/lib/workspace/agentAuth";
import { resolveAccessRole } from "@/app/api/workspaces/_access";
import type { WorkspaceRuntimeRequest } from "@/lib/workspace-agent/contracts";
import { executeWorkspaceActions, readWorkspaceSnapshot } from "@/lib/workspace-agent/workspaceExecutor";
import { beginWorkspaceTurn, cancelRunningWorkspaceTurns, cancelWorkspaceTurn, completeWorkspaceTurn, isWorkspaceTurnCancelled } from "@/lib/workspace-agent/turnStore";
import { readProjectAgentTask } from "../task-store";
import type { RuntimeAction } from "./actions";
import { engineRefusal } from "./engines";
import type { RuntimeInput } from "./run-agent";
import { applyWorkspaceBatch, newDirectState } from "./workspace-direct-apply";
import { describeWorkspaceCommands } from "./workspace-direct-commands";
import { formatBoardView } from "./workspace-direct-context";
import { selectWorkspaceCapabilityCategories } from "@/lib/workspace-agent/capabilitySelection";
import { batchProblem, rememberBoardView } from "./workspace-direct-state";
import { accessibleBoard, boardLinks, existingChatBoard, resolveBoard, workspaceServiceKey } from "./workspace-engine";

export type DirectWorkspaceAction = Extract<RuntimeAction, { action: "workspace_commands" | "workspace_view" | "workspace_apply" }>;
export interface DirectOutcome { text: string; failed?: boolean; boardId?: string }

const MODEL_LABEL = "project-agent-direct";
const STOPPED = "The task was stopped; nothing was read or applied.";
const fail = (text: string): DirectOutcome => ({ text, failed: true });

/** The task as the user sees it now. A stop handled by another process only marks the stored task, so the stored flags count as well as the local abort signal. */
async function taskGate(input: RuntimeInput): Promise<{ stopped: boolean; query: string }> {
	const task = input.taskId ? await readProjectAgentTask(input.taskId).catch(() => null) : null;
	const latestNote = [...(task?.steerNotes ?? [])].reverse().find((note) => note.trim());
	// Only the user's newest message counts for confirming sensitive actions: never project knowledge or tool output, and not an older "yes".
	return { stopped: Boolean(input.signal?.aborted) || task?.cancelled === true || task?.status === "failed", query: latestNote ?? input.userPrompt ?? "" };
}

async function linksFor(boardId: string, focusIds: string[]): Promise<string> {
	const fresh = await prisma.workspaceBoard.findUnique({ where: { id: boardId }, select: { blocks: true } });
	return boardLinks(boardId, fresh ?? { blocks: {} }, focusIds);
}

async function executorRequest(input: RuntimeInput, boardId: string, turnId: string, canMutate: boolean, query: string): Promise<WorkspaceRuntimeRequest> {
	const email = input.ownerEmail!.trim().toLowerCase();
	const minted = await signWorkspaceAgentUserToken(email);
	const timeout = AbortSignal.timeout(600_000);
	return { boardId, turnId, query, context: "", modelSelector: MODEL_LABEL, authorization: `Bearer ${workspaceServiceKey()}`, workspaceUserToken: minted.token, actorEmail: email, canMutate, signal: input.signal ? AbortSignal.any([input.signal, timeout]) : timeout };
}

/** The chat's board (created on first use unless the caller is a reviewer), or the one the agent names if the user may open it. */
async function targetBoard(input: RuntimeInput, named: string | undefined, title: string | undefined) {
	const email = input.ownerEmail!;
	const bound = named?.trim() || input.boardId;
	const found = bound ? await accessibleBoard(bound.trim(), email).then((board) => board && { board, created: false })
		: input.readOnly ? await existingChatBoard(input.chatId, email).then((board) => board && { board, created: false })
			: await resolveBoard(input.chatId, email, { title, projectId: input.projectId });
	if (!found) return null;
	const role = await resolveAccessRole(found.board, email);
	return role ? { ...found, canMutate: role !== "VIEWER" && !input.readOnly } : null;
}

const turnPrefix = (taskId: string | undefined) => `pa-${(taskId ?? "adhoc").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60)}-`;
const turnToken = (taskId: string | undefined) => `${turnPrefix(taskId)}${randomUUID().slice(0, 8)}`;
const actorOf = (input: RuntimeInput) => `${input.depth ?? 0}.${input.slot ?? 0}`;

/** When a task ends, flags board turns it left running (a crash between begin and complete) as cancelled so a late commit is refused. */
export async function cancelTaskWorkspaceTurns(taskId: string): Promise<void> {
	const task = await readProjectAgentTask(taskId).catch(() => null);
	if (!task?.workspaceBoardId) return;
	await cancelRunningWorkspaceTurns(task.workspaceBoardId, task.ownerEmail.trim().toLowerCase(), turnPrefix(taskId)).catch(() => 0);
}

type Target = NonNullable<Awaited<ReturnType<typeof targetBoard>>>;

async function viewBoard(input: RuntimeInput, action: Extract<DirectWorkspaceAction, { action: "workspace_view" }>, target: Target): Promise<DirectOutcome> {
	input.onStep?.({ tool: "workspace_view", detail: action.note || (action.blockIds?.join(", ") ?? "board overview") });
	const boardId = target.board.id;
	const request = await executorRequest(input, boardId, "view", target.canMutate, "");
	const snapshot = await readWorkspaceSnapshot(request);
	rememberBoardView(input.workspaceState!, actorOf(input), boardId, snapshot);
	return { boardId, text: formatBoardView(snapshot, { canMutate: target.canMutate, links: `${target.created ? "New board created. " : ""}${await linksFor(boardId, action.blockIds ?? [])}`, blockIds: action.blockIds }) };
}

/** Read the bound board and relevant command contract into the first model prompt. */
export async function initialWorkspacePrompt(input: RuntimeInput): Promise<string> {
	const requestText = input.userPrompt ?? input.query;
	const namesBoard = /\b(board|workspace|canvas)\b/i.test(requestText);
	if ((!input.boardId && !namesBoard) || !input.ownerEmail || !workspaceServiceKey()) return "";
	try {
		const target = await targetBoard(input, undefined, undefined);
		if (!target) return "";
		input.onBoard?.(target.board.id);
		const request = await executorRequest(input, target.board.id, turnToken(input.taskId), target.canMutate, requestText);
		const snapshot = await readWorkspaceSnapshot(request);
		const overview = formatBoardView(snapshot, {
			canMutate: target.canMutate,
			links: `${target.created ? "New board created. " : ""}${await linksFor(target.board.id, [])}`,
		});
		const guidance = describeWorkspaceCommands({ categories: selectWorkspaceCapabilityCategories(requestText) });
		if (guidance.failed) return "";
		return `Initial Workspace context (read-only; revision ${snapshot.revision}):\n${overview}\n\nRelevant command guidance:\n${guidance.text}\n\nUse workspace_apply for requested edits. Call workspace_view for full block content or if the board changes before applying.`;
	} catch { return ""; }
}

async function applyToBoard(input: RuntimeInput, action: Extract<DirectWorkspaceAction, { action: "workspace_apply" }>, target: Target, query: string): Promise<DirectOutcome> {
	const boardId = target.board.id;
	const turnId = turnToken(input.taskId);
	const key = { boardId, actorEmail: input.ownerEmail!.trim().toLowerCase(), turnId };
	const request = await executorRequest(input, boardId, turnId, target.canMutate, query);
	// A turn row makes the commit lock-check "still running": stopping the task flags it, so a commit racing the stop is refused instead of saved.
	const begun = await beginWorkspaceTurn(key, { query: JSON.stringify(action.actions), modelSelector: MODEL_LABEL, context: "" });
	if (begun.kind !== "started") return fail("The board turn could not be started; try again.");
	const onAbort = () => { void cancelWorkspaceTurn(key).catch(() => {}); };
	input.signal?.addEventListener("abort", onAbort, { once: true });
	let outcome: Awaited<ReturnType<typeof applyWorkspaceBatch>> | undefined;
	try {
		outcome = await applyWorkspaceBatch(
			{ request, query, state: input.workspaceState!, readOnlyAgent: input.readOnly, revision: action.revision, actor: actorOf(input) },
			action.actions,
			{ readSnapshot: readWorkspaceSnapshot, execute: executeWorkspaceActions, links: linksFor, isCancelled: async () => (await taskGate(input)).stopped || await isWorkspaceTurnCancelled(key) },
		);
		if (outcome.saved > 0 && input.workspaceState) input.onWorkspaceSaved?.({ boardId, saved: input.workspaceState.saved, focusIds: input.workspaceState.focusIds, summaries: outcome.summaries ?? [] });
		return { boardId, text: `${target.created ? "New board created. " : ""}${outcome.text}${input.boardId ? "" : "\nIn your final answer give the links as Markdown, for example [Open the board](/workspace?id=...)."}`, failed: outcome.failed };
	} finally {
		input.signal?.removeEventListener("abort", onAbort);
		const status = !outcome || (outcome.failed && outcome.saved === 0) ? "failed" : outcome.failed ? "partial" : "completed";
		await completeWorkspaceTurn(key, { turnId, status, answer: (outcome?.text ?? "").slice(0, 2000), receipts: [], appliedSummaries: [], unresolvedSummaries: [], focusBlockIds: outcome?.focusIds ?? [] }).catch(() => false);
	}
}

/** Handles workspace_commands, workspace_view and workspace_apply: the agent edits the board itself, with no second model between it and the commands. */
export async function runDirectWorkspace(input: RuntimeInput, action: DirectWorkspaceAction): Promise<DirectOutcome> {
	const refusal = engineRefusal(input.engines, action.action);
	if (refusal) return fail(refusal);
	try {
		if (action.action === "workspace_commands") {
			input.onStep?.({ tool: "workspace_commands", detail: action.note || (action.categories?.join(", ") ?? action.query ?? "") });
			return describeWorkspaceCommands(action);
		}
		if (!input.ownerEmail || !workspaceServiceKey()) return fail("The Workspace engine is not configured on this server.");
		const state = (input.workspaceState ??= newDirectState());
		if (action.action === "workspace_apply") {
			input.onStep?.({ tool: "workspace_apply", detail: action.note || `${action.actions.length} command(s): ${[...new Set(action.actions.map((item) => String(item.type)))].slice(0, 6).join(", ")}` });
			// Size, reviewer and cap checks come before a board is created, a turn row is written or a token is minted.
			const problem = batchProblem(action.actions, { readOnlyAgent: input.readOnly, saved: state.saved });
			if (problem) return fail(problem);
		}
		const gate = await taskGate(input);
		if (gate.stopped) return fail(STOPPED);
		const target = await targetBoard(input, action.board, action.title);
		if (!target) return fail(input.readOnly && !action.board?.trim() ? "This chat has no Workspace board yet, and a reviewer cannot create one. Report that there is nothing to review on the board." : "That Workspace board does not exist or this user cannot open it. Omit board to use this chat's board.");
		input.onBoard?.(target.board.id);
		return action.action === "workspace_view" ? await viewBoard(input, action, target) : await applyToBoard(input, action, target, gate.query);
	} catch (cause) { return fail(`${action.action} failed: ${cause instanceof Error ? cause.message : "error"}`); }
}
