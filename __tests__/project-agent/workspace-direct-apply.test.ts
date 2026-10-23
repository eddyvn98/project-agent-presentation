import { describe, expect, it, vi } from "vitest";
import type { WorkspaceBoardSnapshot, WorkspaceJson, WorkspaceRuntimeRequest } from "@/lib/workspace-agent/contracts";
import { applyWorkspaceBatch, newDirectState, type ApplyContext, type ApplyDeps } from "@/lib/project-agent/runtime/workspace-direct-apply";
import { rememberBoardView } from "@/lib/project-agent/runtime/workspace-direct-state";

const snapshot = (revision = 4): WorkspaceBoardSnapshot => ({ revision, title: "Memo board", blocks: { b1: { id: "b1", type: "text", data: { markdown: "Hello" } } }, blockOrder: ["b1"], connectors: {} });
const request = (canMutate = true, signal = new AbortController().signal): WorkspaceRuntimeRequest => ({ boardId: "board-1", turnId: "pa-task-1", query: "", modelSelector: "x", authorization: "Bearer k", workspaceUserToken: "t", actorEmail: "a@b.com", canMutate, signal });
const saved = (revision: number, actions: WorkspaceJson[]) => ({ httpStatus: 200, body: { success: true, revision, actions, notes: [] } });

function setup(overrides: Partial<ApplyDeps> = {}, ctx: Partial<ApplyContext> = {}) {
	const deps: ApplyDeps = {
		readSnapshot: vi.fn(async () => snapshot()),
		execute: vi.fn(async () => saved(5, [{ type: "create_block", ids: ["doc-1"], changed: true, summary: "memo" }])),
		links: vi.fn(async () => "Board: /workspace?id=board-1"),
		...overrides,
	};
	const context: ApplyContext = { request: request(), query: "write a short memo", state: newDirectState(), ...ctx };
	// The agent has looked at the board (revision 4) before it edits it.
	rememberBoardView(context.state, "0.0", "board-1", snapshot());
	return { deps, context };
}

const createDoc = { type: "create_block", blockType: "doc", markdown: "# Memo\n\nBody" };

describe("workspace_apply core", () => {
	it("executes the batch against the revision just read and reports a receipt per command", async () => {
		const { deps, context } = setup();
		const outcome = await applyWorkspaceBatch(context, [createDoc], deps);
		expect(outcome.failed).toBe(false);
		expect(outcome.saved).toBe(1);
		expect(outcome.text).toContain("Saved 1 of 1 command(s); board revision 4 -> 5.");
		expect(outcome.text).toContain("1. create_block saved (ids: doc-1)");
		expect(outcome.text).toContain("Board: /workspace?id=board-1");
		expect(deps.execute).toHaveBeenCalledWith(expect.objectContaining({ boardId: "board-1" }), "pa-task-1", 1, 4, [createDoc]);
		expect(deps.links).toHaveBeenCalledWith("board-1", ["doc-1"]);
	});

	it("returns one readable summary per saved command, in the language of the request", async () => {
		const english = setup();
		const first = await applyWorkspaceBatch(english.context, [createDoc], english.deps);
		expect(first.summaries).toEqual(["memo"]);
		const version = { type: "create_version", label: "v1" };
		const execute = vi.fn(async () => ({ httpStatus: 200, body: { success: true, revision: 5, actions: [{ type: "create_version", ids: ["board"], changed: true }], result: { snapshot: { label: "Final" } }, notes: [] } }));
		const vietnamese = setup({ execute }, { query: "hãy lưu một phiên bản" }); // vi-allow: Vietnamese request fixture
		const second = await applyWorkspaceBatch(vietnamese.context, [version], vietnamese.deps);
		expect(second.summaries).toEqual(["Đã lưu phiên bản “Final”."]); // vi-allow: localized receipt
	});

	it("rejects an invalid command before anything runs", async () => {
		const { deps, context } = setup();
		const unknown = await applyWorkspaceBatch(context, [{ type: "not_a_command" }], deps);
		expect(unknown).toMatchObject({ failed: true, saved: 0 });
		expect(unknown.text).toContain("Nothing was applied. Command 1 (not_a_command) is invalid");
		const missingTable = await applyWorkspaceBatch(context, [createDoc, { type: "update_table_cells", blockId: "missing", cells: [{ row: 0, column: 0, value: "x" }] }], deps);
		expect(missingTable.text).toContain("Command 2 (update_table_cells) is invalid");
		expect(missingTable.text).toMatch(/Expected shape[^\n]*\n- update_table_cells \{blockId\*:string, cells\*:/);
		expect(deps.execute).not.toHaveBeenCalled();
	});

	it("lets later commands use a block the same batch creates under its own id", async () => {
		const { deps, context } = setup();
		const batch = [{ type: "create_block", blockType: "table", id: "t-new", data: { rows: 2, cols: 2, cells: [["a", "b"], ["c", "d"]] } }, { type: "update_table_cells", blockId: "t-new", cells: [{ row: 0, column: 0, value: "z" }] }];
		await applyWorkspaceBatch(context, batch, deps);
		expect(deps.execute).toHaveBeenCalledTimes(1);
	});

	it("runs nothing when a sensitive action lacks the user's confirmation, and runs it once they confirm", async () => {
		const share = { type: "share_board", email: "pat@example.com", role: "VIEWER", confirm: true };
		const first = setup({}, { query: "please share the board with Pat" });
		const refused = await applyWorkspaceBatch(first.context, [share], first.deps);
		expect(refused).toMatchObject({ failed: true, saved: 0 });
		expect(refused.text).toContain("needs the user's explicit confirmation");
		expect(first.deps.execute).not.toHaveBeenCalled();
		const second = setup({}, { query: "Yes, confirm: share the board with pat@example.com as VIEWER" });
		await applyWorkspaceBatch(second.context, [share], second.deps);
		expect(second.deps.execute).toHaveBeenCalledTimes(1);
	});

	it("refuses to change the board for a view-only user or a reviewer, but still allows read-only commands", async () => {
		const viewer = setup({}, { request: request(false) });
		expect((await applyWorkspaceBatch(viewer.context, [createDoc], viewer.deps)).text).toContain("view the board but may not change it");
		expect(viewer.deps.readSnapshot).not.toHaveBeenCalled();
		const reviewer = setup({}, { readOnlyAgent: true });
		expect((await applyWorkspaceBatch(reviewer.context, [createDoc], reviewer.deps)).text).toContain("You are a reviewer");
		const read = setup({ execute: vi.fn(async () => ({ httpStatus: 200, body: { success: true, revision: 4, actions: [{ type: "list_comments", ids: [], changed: false }], result: { comments: [] } } })) }, { request: request(false) });
		const outcome = await applyWorkspaceBatch(read.context, [{ type: "list_comments" }], read.deps);
		expect(outcome.failed).toBe(false);
		expect(outcome.text).toContain("list_comments read");
		expect(read.deps.execute).toHaveBeenCalledTimes(1);
	});

	it("suppresses a command the task already saved", async () => {
		const comment = { type: "add_comment", blockId: "b1", body: "Looks good" };
		const { deps, context } = setup({ execute: vi.fn(async () => saved(5, [{ type: "add_comment", ids: ["c1"], changed: true }])), readSnapshot: vi.fn().mockResolvedValueOnce(snapshot(4)).mockResolvedValue(snapshot(5)) });
		await applyWorkspaceBatch(context, [comment], deps);
		const again = await applyWorkspaceBatch(context, [comment], deps);
		expect(again.text).toContain("already saved earlier in this task");
		expect(again.failed).toBeFalsy();
		expect(deps.execute).toHaveBeenCalledTimes(1);
	});

	it("reports a failed batch as not saved and keeps it eligible for a retry", async () => {
		const failing = vi.fn(async () => ({ httpStatus: 422, body: { error: "Workspace action(s) could not be applied: update_style. Reason: No target matched.", reason: "action_not_applied", actions: [{ type: "update_style", ids: [], changed: false, reason: "No target matched." }] } }));
		const { deps, context } = setup({ execute: failing });
		const outcome = await applyWorkspaceBatch(context, [{ type: "update_style", blockId: "gone", style: { fontSize: 20 } }], deps);
		expect(outcome).toMatchObject({ failed: true, saved: 0 });
		expect(outcome.text).toContain("Nothing was saved");
		expect(outcome.text).toContain("update_style NOT saved: No target matched.");
		expect(context.state.replayKeys.size).toBe(0);
	});

	it("rejects a pinned revision that is out of date, and retries once on a stale save when no revision was pinned", async () => {
		const pinned = setup({}, { revision: 3 });
		expect((await applyWorkspaceBatch(pinned.context, [createDoc], pinned.deps)).text).toContain("revision 4, not 3");
		expect(pinned.deps.execute).not.toHaveBeenCalled();
		const execute = vi.fn()
			.mockResolvedValueOnce({ httpStatus: 409, body: { error: "stale", reason: "stale", revision: 6 } })
			.mockResolvedValueOnce(saved(7, [{ type: "create_block", ids: ["doc-1"], changed: true }]));
		const readSnapshot = vi.fn().mockResolvedValueOnce(snapshot(4)).mockResolvedValueOnce(snapshot(6));
		const retried = setup({ execute, readSnapshot });
		const outcome = await applyWorkspaceBatch(retried.context, [createDoc], retried.deps);
		expect(outcome.text).toContain("board revision 6 -> 7");
		expect(execute.mock.calls.map((call) => [call[2], call[3]])).toEqual([[1, 4], [2, 6]]);
	});

	it("limits the batch size and stops when the task was cancelled", async () => {
		const { deps, context } = setup();
		expect((await applyWorkspaceBatch(context, Array.from({ length: 21 }, () => createDoc), deps)).text).toContain("between 1 and 20");
		const controller = new AbortController();
		controller.abort();
		const cancelled = setup({}, { request: request(true, controller.signal) });
		expect((await applyWorkspaceBatch(cancelled.context, [createDoc], cancelled.deps)).text).toContain("task was stopped");
		const flagged = setup({ isCancelled: async () => true });
		expect((await applyWorkspaceBatch(flagged.context, [createDoc], flagged.deps)).text).toContain("task was stopped");
		expect(flagged.deps.execute).not.toHaveBeenCalled();
	});

	it("turns an executor crash into a check-the-board message", async () => {
		const { deps, context } = setup({ execute: vi.fn(async () => { throw new Error("socket hang up"); }) });
		const outcome = await applyWorkspaceBatch(context, [createDoc], deps);
		expect(outcome.failed).toBe(true);
		expect(outcome.text).toContain("socket hang up");
		expect(outcome.text).toContain("workspace_view");
	});
});
