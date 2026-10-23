import type { WorkspaceBoardSnapshot, WorkspaceJson } from "@/lib/workspace-agent/contracts";
import { suppressWorkspaceActionReplays } from "@/lib/workspace-agent/actionReplayGuard";
import { limitImageFlowCreations, requestedImageFlowCount } from "@/lib/workspace-agent/imageFlowTurnPolicy";
import { validateWorkspaceActionBatch } from "@/lib/workspace-agent/proposalValidation";
import { workspaceActionNeedsConfirmation } from "@/lib/workspace-agent/runtimeSafety";
import { commandLine } from "./workspace-direct-commands";
import { onlyCreatesBlocks, type DirectWorkspaceState } from "./workspace-direct-state";

// Command fields that name another block; a name created earlier in the same batch is a valid reference even though the board does not hold it yet.
const REFERENCE_FIELDS = ["blockId", "newParent", "parentId", "fromBlockId", "toBlockId", "targetId", "relativeToBlockId", "from", "to", "docId", "tableId", "target"];
const REFERENCE_LIST_FIELDS = ["blockIds", "ids", "targets", "targetIds"];

export type Prepared = { error: string } | { run: WorkspaceJson[]; skipped: number };

function references(action: WorkspaceJson): string[] {
	const found = REFERENCE_FIELDS.flatMap((key) => typeof action[key] === "string" ? [String(action[key])] : []);
	for (const key of REFERENCE_LIST_FIELDS) if (Array.isArray(action[key])) found.push(...(action[key] as unknown[]).filter((item): item is string => typeof item === "string"));
	return found;
}

/** Ids this batch gives to new blocks, with the index of the command that creates each. */
function createdIds(actions: WorkspaceJson[]): Map<string, number> {
	const created = new Map<string, number>();
	actions.forEach((action, index) => { if (action.type === "create_block" && typeof action.id === "string" && !created.has(action.id)) created.set(action.id, index); });
	return created;
}

/**
 * True when the batch cannot overwrite content someone else may have changed: every command only adds blocks or reads,
 * or targets only blocks created earlier in this batch, or the board is still empty. Such a batch needs no fresh view.
 */
export function touchesOnlyNewContent(actions: WorkspaceJson[], snapshot: WorkspaceBoardSnapshot): boolean {
	const blocks = snapshot.blocks && typeof snapshot.blocks === "object" ? snapshot.blocks as WorkspaceJson : {};
	if (!Object.keys(blocks).length) return true;
	const created = createdIds(actions);
	return actions.every((action) => {
		if (onlyCreatesBlocks([action])) return true;
		const targets = references(action);
		return targets.length > 0 && targets.every((id) => created.has(id));
	});
}

/** A create_block whose id is taken would overwrite that block; the id must be new on the board and unique in the batch. */
function idCollision(actions: WorkspaceJson[], snapshot: WorkspaceBoardSnapshot): string | null {
	const blocks = snapshot.blocks && typeof snapshot.blocks === "object" ? snapshot.blocks as WorkspaceJson : {};
	const seen = new Set<string>();
	for (const [index, action] of actions.entries()) {
		if (action.type !== "create_block" || typeof action.id !== "string" || !action.id.trim()) continue;
		const where = Object.prototype.hasOwnProperty.call(blocks, action.id) ? "already exists on the board" : seen.has(action.id) ? "is used by an earlier create_block in this batch" : "";
		if (where) return `Nothing was applied. Command ${index + 1} (create_block) has id "${action.id}", which ${where}; creating it would overwrite that block. Choose an id that is not in use, or omit id and take the created id from the receipt.`;
		seen.add(action.id);
	}
	return null;
}

/** Everything that can be decided without touching the board: schema and target checks, id collisions, replay guard, image-flow limit, confirmation of sensitive actions. */
export function prepareBatch(state: DirectWorkspaceState, query: string, snapshot: WorkspaceBoardSnapshot, actions: WorkspaceJson[]): Prepared {
	const created = createdIds(actions);
	const collision = idCollision(actions, snapshot);
	if (collision) return { error: collision };
	const problem = validateWorkspaceActionBatch(actions, snapshot, (action, index) => references(action).some((id) => (created.get(id) ?? Infinity) < index));
	if (problem) {
		const type = String(actions[Math.max(0, problem.index)]?.type);
		const shape = commandLine(type).includes("{") ? ` Expected shape (* required):\n${commandLine(type)}\n` : " ";
		return { error: `Nothing was applied. Command ${problem.index + 1} (${type}) is invalid: ${problem.issue}${shape}Fix it and send the batch again.` };
	}
	const replay = suppressWorkspaceActionReplays(actions, state.replayKeys);
	const flows = limitImageFlowCreations(replay.actions, requestedImageFlowCount(query) - state.imageFlows);
	const unconfirmed = flows.actions.filter((action) => workspaceActionNeedsConfirmation(action, query, ""));
	if (unconfirmed.length) return { error: `Nothing was applied: ${[...new Set(unconfirmed.map((action) => String(action.type)))].join(", ")} needs the user's explicit confirmation. Ask the user to confirm in their next message, naming the exact target (email and role, block ids, snapshot id; for a public link on or off plus the expiry, such as 7d) and, for deletions, that they want it deleted. Call workspace_apply again only after that message.` };
	return { run: flows.actions, skipped: replay.suppressed + flows.suppressed };
}
