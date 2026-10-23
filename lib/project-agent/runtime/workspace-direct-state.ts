import type { WorkspaceBoardSnapshot, WorkspaceJson } from "@/lib/workspace-agent/contracts";
import { WORKSPACE_READ_ONLY_COMMANDS } from "@/lib/workspace-agent/runtimeSafety";

/** Commands accepted by one workspace_apply call. */
export const MAX_DIRECT_ACTIONS = 20;
/** Board-changing commands one task may save in total; a looping agent cannot flood the board. Read-only commands do not count. */
export const MAX_TASK_COMMANDS = 120;
/** Commands that only add new blocks: they cannot overwrite what the user or another agent changed, so they may run on a board that moved on. */
const CREATE_ONLY_COMMANDS = new Set(["create_block", "create_shape", "create_image_flow", "create_video_flow"]);

/** What one agent last saw of a board: its revision, and (when no write happened since) each block's update stamp. */
interface BoardSight { revision: number; stamps?: Map<string, string>; stampsRevision?: number }

/** Per-task board state shared by every apply call and sub-agent; `saved`, `boardId` and `focusIds` tell the caller what reached the board. */
export interface DirectWorkspaceState {
	/** Intent keys of commands already saved (replay guard). */
	replayKeys: Set<string>;
	/** Image flows created so far, against the number the user asked for. */
	imageFlows: number;
	/** Board-changing commands saved by this task. */
	saved: number;
	boardId?: string;
	focusIds: string[];
	/** Last revision each agent (lead or sub-agent slot) saw per board, set by workspace_view and by its own saved applies. */
	sights: Map<string, BoardSight>;
	/** Tail of the promise chain that serialises apply calls of concurrent sub-agents. */
	queue: Promise<unknown>;
}

export const newDirectState = (): DirectWorkspaceState => ({ replayKeys: new Set(), imageFlows: 0, saved: 0, focusIds: [], sights: new Map(), queue: Promise.resolve() });

const sightKey = (actor: string, boardId: string) => `${actor}|${boardId}`;
const stampOf = (block: unknown) => String((block as { updatedAt?: unknown } | null)?.updatedAt ?? "");

/** The agent looked at the whole board at this revision. */
export function rememberBoardView(state: DirectWorkspaceState, actor: string, boardId: string, snapshot: WorkspaceBoardSnapshot): void {
	const blocks = snapshot.blocks && typeof snapshot.blocks === "object" ? snapshot.blocks as WorkspaceJson : {};
	state.sights.set(sightKey(actor, boardId), { revision: snapshot.revision, stampsRevision: snapshot.revision, stamps: new Map(Object.entries(blocks).map(([id, block]) => [id, stampOf(block)])) });
}

/** The agent's own batch moved the board to this revision, so it knows that state. */
export function rememberBoardRevision(state: DirectWorkspaceState, actor: string, boardId: string, revision: number): void {
	const previous = state.sights.get(sightKey(actor, boardId));
	state.sights.set(sightKey(actor, boardId), { revision, stamps: previous?.stamps, stampsRevision: previous?.stampsRevision });
}

export const seenRevision = (state: DirectWorkspaceState, actor: string, boardId: string): number | undefined => state.sights.get(sightKey(actor, boardId))?.revision;

/** Which blocks differ from what the agent saw, when that is still known; empty otherwise. */
export function describeBoardDrift(state: DirectWorkspaceState, actor: string, boardId: string, snapshot: WorkspaceBoardSnapshot): string {
	const sight = state.sights.get(sightKey(actor, boardId));
	if (!sight?.stamps || sight.stampsRevision !== sight.revision) return "";
	const blocks = snapshot.blocks && typeof snapshot.blocks === "object" ? snapshot.blocks as WorkspaceJson : {};
	const changed = Object.entries(blocks).filter(([id, block]) => sight.stamps!.get(id) !== undefined && sight.stamps!.get(id) !== stampOf(block)).map(([id]) => id);
	const added = Object.keys(blocks).filter((id) => !sight.stamps!.has(id));
	const removed = [...sight.stamps.keys()].filter((id) => !(id in blocks));
	const part = (label: string, ids: string[]) => ids.length ? ` ${label}: ${ids.slice(0, 8).join(", ")}${ids.length > 8 ? ", ..." : ""}.` : "";
	return `${part("Changed", changed)}${part("Added", added)}${part("Removed", removed)}`;
}

export const isReadOnlyBatch = (actions: WorkspaceJson[]) => actions.every((action) => WORKSPACE_READ_ONLY_COMMANDS.has(String(action.type)));
export const onlyCreatesBlocks = (actions: WorkspaceJson[]) => actions.every((action) => CREATE_ONLY_COMMANDS.has(String(action.type)) || WORKSPACE_READ_ONLY_COMMANDS.has(String(action.type)));

/** Size, reviewer and cumulative-cap checks that need neither the board nor a token: run them before anything is created. */
export function batchProblem(actions: unknown[], options: { readOnlyAgent?: boolean; saved: number }): string | null {
	if (!actions.length || actions.length > MAX_DIRECT_ACTIONS) return `Send between 1 and ${MAX_DIRECT_ACTIONS} commands per workspace_apply; split larger jobs into several calls.`;
	if (isReadOnlyBatch(actions as WorkspaceJson[])) return null;
	if (options.readOnlyAgent) return "You are a reviewer: you may not change Workspace boards.";
	const left = MAX_TASK_COMMANDS - options.saved;
	if (actions.length > left) return `This task may save at most ${MAX_TASK_COMMANDS} board commands in total and ${options.saved} are already saved, so ${Math.max(0, left)} are left. ${left > 0 ? "Send a smaller batch" : "Do not send more commands"}, and finish with what is on the board.`;
	return null;
}

/** Runs apply calls of one task one after another: concurrent sub-agents must not both pass the replay guard and image-flow limit before either records its saves. */
export function serialiseApply<T>(state: DirectWorkspaceState, work: () => Promise<T>): Promise<T> {
	const run = state.queue.then(work, work);
	state.queue = run.catch(() => undefined);
	return run;
}
