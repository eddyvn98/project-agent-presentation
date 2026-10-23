import type { WorkspaceBoardSnapshot, WorkspaceJson, WorkspaceRuntimeRequest } from "@/lib/workspace-agent/contracts";
import type { WorkspaceExecutorResult } from "@/lib/workspace-agent/workspaceExecutor";
import { workspaceActionReplayKey } from "@/lib/workspace-agent/actionReplayGuard";
import { workspaceActionReceiptSummary } from "@/lib/workspace-agent/receiptSummaries";
import { getWorkspaceResponseLanguageInstruction } from "@/app/workspace/utils/workspaceChatRequest";
import { bindConfirmedWorkspaceDefaults, compactWorkspaceReadResult, WORKSPACE_READ_ONLY_COMMANDS } from "@/lib/workspace-agent/runtimeSafety";
import { prepareBatch, touchesOnlyNewContent } from "./workspace-direct-prepare";
import { batchProblem, describeBoardDrift, isReadOnlyBatch, rememberBoardRevision, seenRevision, serialiseApply, type DirectWorkspaceState } from "./workspace-direct-state";

export { MAX_DIRECT_ACTIONS, MAX_TASK_COMMANDS, newDirectState, type DirectWorkspaceState } from "./workspace-direct-state";

// Commands whose target ids are not blocks, so they never become "focus" links.
const NON_BLOCK_TARGETS = new Set(["list_versions", "create_version", "restore_version", "export_board", "import_markdown", "list_shares", "share_board", "remove_share", "set_public_link"]);

export interface ApplyContext {
	/** Executor request: board, turn id, credentials, whether the user may edit, abort signal. */
	request: WorkspaceRuntimeRequest;
	/** The user's latest own message (the newest note or the task prompt); sensitive actions are confirmed against this text only. */
	query: string;
	state: DirectWorkspaceState;
	/** A reviewer sub-agent may only run read-only commands. */
	readOnlyAgent?: boolean;
	/** Revision the agent states it saw; a different current revision rejects the batch instead of overwriting newer edits. */
	revision?: number;
	/** Which agent (lead or a sub-agent slot) is applying, so each one's view of the board is tracked separately. */
	actor?: string;
}

export interface ApplyDeps {
	readSnapshot(request: WorkspaceRuntimeRequest): Promise<WorkspaceBoardSnapshot>;
	execute(request: WorkspaceRuntimeRequest, turnId: string, round: number, revision: number, actions: WorkspaceJson[]): Promise<WorkspaceExecutorResult>;
	links(boardId: string, focusIds: string[]): Promise<string>;
	isCancelled?(): Promise<boolean>;
}

export interface ApplyOutcome {
	text: string;
	failed?: boolean;
	saved: number;
	focusIds: string[];
	/** One readable line per saved command that has a description, in the language of the user's request (what the Workspace chat lists as applied changes). */
	summaries?: string[];
}

const record = (value: unknown): WorkspaceJson => value && typeof value === "object" && !Array.isArray(value) ? value as WorkspaceJson : {};
const stop = (text: string): ApplyOutcome => ({ text, failed: true, saved: 0, focusIds: [] });

/** Edits to existing content need the agent to have seen the board as it is now; commands that only add blocks cannot overwrite anyone's work. */
function revisionProblem(ctx: ApplyContext, actor: string, snapshot: WorkspaceBoardSnapshot, actions: WorkspaceJson[]): string | null {
	if (isReadOnlyBatch(actions)) return null;
	const { state, request } = ctx;
	const drift = describeBoardDrift(state, actor, request.boardId, snapshot);
	if (ctx.revision !== undefined && ctx.revision !== snapshot.revision) return `Nothing was applied: the board is at revision ${snapshot.revision}, not ${ctx.revision} (it changed since you looked).${drift} Call workspace_view, then send the batch again.`;
	if (touchesOnlyNewContent(actions, snapshot)) return null;
	const seen = ctx.revision ?? seenRevision(state, actor, request.boardId);
	if (seen === snapshot.revision) return null;
	if (seen === undefined) return "Nothing was applied: these commands change existing content but you have not looked at this board in this task. Call workspace_view, then send the batch again.";
	return `Nothing was applied: the board is at revision ${snapshot.revision} but you last saw revision ${seen} (the user or another agent changed it).${drift} Call workspace_view to read the current content, then send the batch again.`;
}

function describeResult(ctx: ApplyContext, snapshot: WorkspaceBoardSnapshot, run: WorkspaceJson[], execution: WorkspaceExecutorResult): { lines: string[]; summaries: string[]; saved: number; focusIds: string[]; committed: boolean; reads: WorkspaceJson[] } {
	const { body } = execution;
	const committed = execution.httpStatus >= 200 && execution.httpStatus < 300 && body.success === true;
	const results = Array.isArray(body.actions) ? body.actions.map(record) : [];
	const lines: string[] = [];
	const summaries: string[] = [];
	const language = getWorkspaceResponseLanguageInstruction(ctx.query) === "Vietnamese" ? "Vietnamese" : "English";
	const focusIds: string[] = [];
	const reads: WorkspaceJson[] = [];
	let saved = 0;
	run.forEach((action, index) => {
		const type = String(action.type);
		const result = results[index] ?? {};
		const changed = committed && result.changed === true;
		const readDone = committed && WORKSPACE_READ_ONLY_COMMANDS.has(type) && result.changed === false;
		const ids = Array.isArray(result.ids) ? result.ids.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
		if (changed) {
			saved += 1;
			const key = workspaceActionReplayKey(action);
			if (key) ctx.state.replayKeys.add(key);
			if (type === "create_image_flow") ctx.state.imageFlows += 1;
			if (!NON_BLOCK_TARGETS.has(type)) focusIds.push(...ids.filter((id) => id !== "board"));
			const summary = workspaceActionReceiptSummary({ actionType: type, action, actionResult: result, language, targetIds: ids, snapshot, body, changed });
			if (summary) summaries.push(summary.length > 100 ? `${summary.slice(0, 99).trimEnd()}…` : summary);
			lines.push(`${index + 1}. ${type} saved${ids.length ? ` (ids: ${ids.slice(0, 6).join(", ")}${ids.length > 6 ? ", ..." : ""})` : ""}${summary ? `: ${summary.slice(0, 120)}` : ""}`);
		} else if (readDone) {
			reads.push(compactWorkspaceReadResult(type, body.result));
			lines.push(`${index + 1}. ${type} read`);
		} else {
			lines.push(`${index + 1}. ${type} NOT saved: ${String(result.reason ?? (result.notes as unknown[] | undefined)?.join(" ") ?? body.error ?? "the executor did not confirm it")}`.slice(0, 500));
		}
	});
	return { lines, summaries, saved, focusIds: [...new Set(focusIds)].slice(0, 8), committed, reads };
}

async function runBatch(ctx: ApplyContext, actor: string, actions: WorkspaceJson[], deps: ApplyDeps): Promise<ApplyOutcome> {
	const { request, state } = ctx;
	// The cap is checked again here: another apply may have saved commands while this one waited its turn.
	const problem = batchProblem(actions, { readOnlyAgent: ctx.readOnlyAgent, saved: state.saved });
	if (problem) return stop(problem);
	if (!isReadOnlyBatch(actions) && !request.canMutate) return stop("This user can view the board but may not change it. Nothing was applied; tell the user they need edit access.");
	const ensureActive = async () => { if (request.signal.aborted || await deps.isCancelled?.()) throw new Error("cancelled"); };
	try {
		await ensureActive();
		let snapshot = await deps.readSnapshot(request);
		for (let attempt = 1; ; attempt += 1) {
			const stale = revisionProblem(ctx, actor, snapshot, actions);
			if (stale) return stop(stale);
			const prepared = prepareBatch(state, ctx.query, snapshot, actions);
			if ("error" in prepared) return stop(prepared.error);
			if (!prepared.run.length) return { text: "Nothing was applied again: these commands were already saved earlier in this task (or exceed the number of image flows the user asked for).", saved: 0, focusIds: [] };
			await ensureActive();
			const execution = await deps.execute(request, request.turnId, attempt, snapshot.revision, prepared.run.map(bindConfirmedWorkspaceDefaults));
			if (execution.httpStatus === 409 && execution.body.reason === "stale") {
				// Saved nothing. Only commands that add blocks may be sent again on the newer board; edits must be re-read by the agent first.
				if (attempt > 1 || ctx.revision !== undefined || !touchesOnlyNewContent(actions, snapshot)) return stop(`Nothing was applied: the board changed while the batch was being saved (now at revision ${String(execution.body.revision ?? "newer")}). Call workspace_view to read the current content, then send the batch again.`);
				snapshot = await deps.readSnapshot(request);
				continue;
			}
			const outcome = describeResult(ctx, snapshot, prepared.run, execution);
			const revisionAfter = Number.isInteger(execution.body.revision) ? Number(execution.body.revision) : undefined;
			if (outcome.saved > 0) { state.saved += outcome.saved; state.boardId = request.boardId; state.focusIds = [...new Set([...state.focusIds, ...outcome.focusIds])].slice(0, 12); }
			// The agent now knows the new revision only if it knew the one before; otherwise someone else's edits are still unseen.
			const prior = seenRevision(state, actor, request.boardId);
			const knewBoard = prior === snapshot.revision || ctx.revision === snapshot.revision || (prior === undefined && !Object.keys(record(snapshot.blocks)).length);
			if (outcome.committed && revisionAfter !== undefined && knewBoard) rememberBoardRevision(state, actor, request.boardId, revisionAfter);
			const links = await deps.links(request.boardId, outcome.focusIds).catch(() => `Board: /workspace?id=${request.boardId}`);
			const notes = Array.isArray(execution.body.notes) ? execution.body.notes.filter((note): note is string => typeof note === "string").slice(0, 5).map((note) => `Note: ${note.slice(0, 240)}`) : [];
			const head = outcome.committed
				? outcome.saved ? `Saved ${outcome.saved} of ${prepared.run.length} command(s); board revision ${snapshot.revision} -> ${revisionAfter ?? "?"}.${prepared.skipped ? ` ${prepared.skipped} repeated command(s) were skipped.` : ""}` : `Done; nothing needed saving.${prepared.skipped ? ` ${prepared.skipped} repeated command(s) were skipped.` : ""}`
				: `Nothing was saved (a batch is all-or-nothing${typeof execution.body.error === "string" ? `; ${execution.body.error.slice(0, 600)}` : execution.httpStatus >= 200 && execution.httpStatus < 300 ? "; the commands changed nothing on the board" : ""}). Fix the failing command and send the batch again, or call workspace_view first if the board may have changed.`;
			return { text: [head, ...outcome.lines, ...notes, ...(outcome.reads.length ? [`Read results: ${JSON.stringify(outcome.reads).slice(0, 3000)}`] : []), links].join("\n"), failed: !outcome.committed, saved: outcome.saved, focusIds: outcome.focusIds, summaries: outcome.summaries };
		}
	} catch (cause) {
		if (cause instanceof Error && cause.message === "cancelled") return stop("The task was stopped before this batch ran; nothing was applied.");
		return stop(`workspace_apply failed: ${cause instanceof Error ? cause.message : "error"}. The batch may or may not have been saved: call workspace_view to check before sending it again.`);
	}
}

/** Validates and runs one batch of Workspace commands on the board, in order and all-or-nothing, and reports a receipt per command. Calls of one task run one at a time. */
export function applyWorkspaceBatch(ctx: ApplyContext, actions: WorkspaceJson[], deps: ApplyDeps): Promise<ApplyOutcome> {
	const early = batchProblem(actions, { readOnlyAgent: ctx.readOnlyAgent, saved: ctx.state.saved });
	if (early) return Promise.resolve(stop(early));
	return serialiseApply(ctx.state, () => runBatch(ctx, ctx.actor ?? "0.0", actions, deps));
}
