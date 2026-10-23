import { describe, expect, it, vi } from "vitest";
import type { WorkspaceBoardSnapshot, WorkspaceJson, WorkspaceRuntimeRequest } from "@/lib/workspace-agent/contracts";
import { applyWorkspaceBatch, MAX_TASK_COMMANDS, newDirectState, type ApplyContext, type ApplyDeps } from "@/lib/project-agent/runtime/workspace-direct-apply";
import { rememberBoardView } from "@/lib/project-agent/runtime/workspace-direct-state";

const snapshot = (revision = 4, stamp = 1): WorkspaceBoardSnapshot => ({ revision, title: "Board", blocks: { b1: { id: "b1", type: "text", updatedAt: stamp, data: { markdown: "Hello" } } }, blockOrder: ["b1"], connectors: {} });
const request = (): WorkspaceRuntimeRequest => ({ boardId: "board-1", turnId: "pa-task-1", query: "", modelSelector: "x", authorization: "Bearer k", workspaceUserToken: "t", actorEmail: "a@b.com", canMutate: true, signal: new AbortController().signal });
const saved = (revision: number, actions: WorkspaceJson[]) => ({ httpStatus: 200, body: { success: true, revision, actions, notes: [] } });

function setup(overrides: Partial<ApplyDeps> = {}, ctx: Partial<ApplyContext> = {}, seen: WorkspaceBoardSnapshot | null = snapshot()) {
	const deps: ApplyDeps = {
		readSnapshot: vi.fn(async () => snapshot()),
		execute: vi.fn(async () => saved(5, [{ type: "create_block", ids: ["doc-1"], changed: true }])),
		links: vi.fn(async () => "Board: /workspace?id=board-1"),
		...overrides,
	};
	const context: ApplyContext = { request: request(), query: "write a memo", state: newDirectState(), ...ctx };
	if (seen) rememberBoardView(context.state, "0.0", "board-1", seen);
	return { deps, context };
}

const createText = (id?: string) => ({ type: "create_block", blockType: "text", ...(id ? { id } : {}), text: "New" });
const edit = { type: "update_style", blockId: "b1", style: { fontSize: 20 } };

describe("create_block id collisions", () => {
	it("refuses an id that already exists on the board, and one used twice in the batch", async () => {
		const { deps, context } = setup();
		const existing = await applyWorkspaceBatch(context, [createText("b1")], deps);
		expect(existing).toMatchObject({ failed: true, saved: 0 });
		expect(existing.text).toContain('Command 1 (create_block) has id "b1", which already exists on the board');
		const twice = await applyWorkspaceBatch(context, [createText("n1"), createText("n1")], deps);
		expect(twice.text).toContain('Command 2 (create_block) has id "n1", which is used by an earlier create_block in this batch');
		expect(deps.execute).not.toHaveBeenCalled();
		await applyWorkspaceBatch(context, [createText("n1"), createText()], deps);
		expect(deps.execute).toHaveBeenCalledTimes(1);
	});
});

describe("concurrent edits", () => {
	it("rejects edits when the board moved on since the agent looked, and names the blocks that changed", async () => {
		const { deps, context } = setup({ readSnapshot: vi.fn(async () => snapshot(6, 2)) });
		const outcome = await applyWorkspaceBatch(context, [edit], deps);
		expect(outcome).toMatchObject({ failed: true, saved: 0 });
		expect(outcome.text).toContain("board is at revision 6 but you last saw revision 4");
		expect(outcome.text).toContain("Changed: b1.");
		expect(outcome.text).toContain("workspace_view");
		expect(deps.execute).not.toHaveBeenCalled();
	});

	it("still adds new blocks on a board that moved on, saved against the current revision", async () => {
		const { deps, context } = setup({ readSnapshot: vi.fn(async () => snapshot(6, 2)) });
		const outcome = await applyWorkspaceBatch(context, [createText("n1"), { type: "create_block", blockType: "doc", markdown: "# Memo" }], deps);
		expect(outcome.failed).toBe(false);
		expect(deps.execute).toHaveBeenCalledWith(expect.anything(), "pa-task-1", 1, 6, expect.any(Array));
	});

	it("asks for a look first when the agent never viewed the board, but allows creating blocks", async () => {
		const edits = setup({}, {}, null);
		expect((await applyWorkspaceBatch(edits.context, [edit], edits.deps)).text).toContain("have not looked at this board");
		const creates = setup({}, {}, null);
		expect((await applyWorkspaceBatch(creates.context, [createText()], creates.deps)).failed).toBe(false);
	});

	it("keeps the pinned revision check, even for new blocks", async () => {
		const { deps, context } = setup({}, { revision: 3 });
		expect((await applyWorkspaceBatch(context, [createText()], deps)).text).toContain("revision 4, not 3");
		const matching = setup({}, { revision: 4 }, null);
		expect((await applyWorkspaceBatch(matching.context, [edit], matching.deps)).failed).toBe(false);
	});

	it("does not re-send edits after a stale save: the agent must read the board again", async () => {
		const execute = vi.fn(async () => ({ httpStatus: 409, body: { error: "stale", reason: "stale", revision: 5 } }));
		const readSnapshot = vi.fn(async () => snapshot());
		const { deps, context } = setup({ execute, readSnapshot });
		const outcome = await applyWorkspaceBatch(context, [edit], deps);
		expect(outcome.text).toContain("board changed while the batch was being saved");
		expect(execute).toHaveBeenCalledTimes(1);
		expect(readSnapshot).toHaveBeenCalledTimes(1);
	});

	it("keeps each agent's view separate: a sub-agent's save leaves the lead's view stale", async () => {
		let revision = 4;
		const execute = vi.fn(async () => { revision = 5; return saved(5, [{ type: "update_style", ids: ["b1"], changed: true }]); });
		const { deps, context } = setup({ execute, readSnapshot: vi.fn(async () => snapshot(revision)) });
		rememberBoardView(context.state, "1.0", "board-1", snapshot());
		expect((await applyWorkspaceBatch({ ...context, actor: "1.0" }, [edit], deps)).failed).toBe(false);
		const lead = await applyWorkspaceBatch(context, [{ type: "update_style", blockId: "b1", style: { fontSize: 30 } }], deps);
		expect(lead.text).toContain("you last saw revision 4");
	});
});

describe("references to blocks created in the same batch", () => {
	it("accepts attach_to_parent whose new parent is created earlier in the batch", async () => {
		const { deps, context } = setup();
		const outcome = await applyWorkspaceBatch(context, [createText("parent-1"), { type: "attach_to_parent", blockId: "b1", newParent: "parent-1" }], deps);
		expect(outcome.text).not.toContain("is invalid");
		expect(deps.execute).toHaveBeenCalledTimes(1);
		const other = setup();
		const unknown = await applyWorkspaceBatch(other.context, [{ type: "attach_to_parent", blockId: "b1", newParent: "nowhere" }], other.deps);
		expect(unknown.text).toContain("newParent must identify an existing block");
	});
});

describe("task limits and ordering", () => {
	it("caps the board commands one task may save, counting what earlier calls saved", async () => {
		const { deps, context } = setup();
		context.state.saved = MAX_TASK_COMMANDS - 1;
		const outcome = await applyWorkspaceBatch(context, [createText(), createText()], deps);
		expect(outcome.text).toContain(`at most ${MAX_TASK_COMMANDS} board commands`);
		expect(outcome.text).toContain("1 are left");
		context.state.saved = MAX_TASK_COMMANDS;
		const read = await applyWorkspaceBatch(context, [{ type: "list_comments" }], { ...deps, execute: vi.fn(async () => ({ httpStatus: 200, body: { success: true, revision: 4, actions: [{ type: "list_comments", ids: [], changed: false }], result: { comments: [] } } })) });
		expect(read.failed).toBe(false);
		const one = setup();
		await applyWorkspaceBatch(one.context, [createText()], one.deps);
		expect(one.context.state.saved).toBe(1);
	});

	it("runs the apply calls of one task one at a time, so a repeated command is seen as already saved", async () => {
		let revision = 4;
		let running = 0;
		let overlap = 0;
		const execute = vi.fn(async () => {
			running += 1; overlap = Math.max(overlap, running);
			await new Promise((resolve) => setTimeout(resolve, 15));
			revision = 5; running -= 1;
			return saved(5, [{ type: "add_comment", ids: ["c1"], changed: true }]);
		});
		const { deps, context } = setup({ execute, readSnapshot: vi.fn(async () => snapshot(revision)) });
		const comment = { type: "add_comment", blockId: "b1", body: "Looks good" };
		const [first, second] = await Promise.all([applyWorkspaceBatch(context, [comment], deps), applyWorkspaceBatch(context, [comment], deps)]);
		expect(overlap).toBe(1);
		expect(execute).toHaveBeenCalledTimes(1);
		expect([first.text, second.text].filter((text) => text.includes("already saved earlier in this task"))).toHaveLength(1);
		expect(context.state.saved).toBe(1);
	});

	it("keeps the queue moving after a failed apply", async () => {
		const { deps, context } = setup({ execute: vi.fn().mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValue(saved(5, [{ type: "create_block", ids: ["x"], changed: true }])) });
		const results = await Promise.all([applyWorkspaceBatch(context, [createText()], deps), applyWorkspaceBatch(context, [createText()], deps)]);
		expect(results.map((item) => item.failed)).toEqual([true, false]);
	});

	it("refuses a reviewer before reading the board", async () => {
		const { deps, context } = setup({}, { readOnlyAgent: true });
		expect((await applyWorkspaceBatch(context, [createText()], deps)).text).toContain("You are a reviewer");
		expect(deps.readSnapshot).not.toHaveBeenCalled();
	});
});
