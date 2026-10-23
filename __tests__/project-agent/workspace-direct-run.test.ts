import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	readTask: vi.fn(),
	readSnapshot: vi.fn(),
	execute: vi.fn(),
	begin: vi.fn(),
	complete: vi.fn(),
	cancel: vi.fn(),
	cancelRunning: vi.fn(),
	isCancelled: vi.fn(),
	sign: vi.fn(),
	resolveBoard: vi.fn(),
	existingBoard: vi.fn(),
	accessibleBoard: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { workspaceBoard: { findUnique: vi.fn(async () => ({ blocks: {} })) } } }));
vi.mock("@/lib/workspace/agentAuth", () => ({ signWorkspaceAgentUserToken: mocks.sign }));
vi.mock("@/app/api/workspaces/_access", () => ({ resolveAccessRole: vi.fn(async () => "OWNER") }));
vi.mock("@/lib/workspace-agent/workspaceExecutor", () => ({ readWorkspaceSnapshot: mocks.readSnapshot, executeWorkspaceActions: mocks.execute }));
vi.mock("@/lib/workspace-agent/turnStore", () => ({ beginWorkspaceTurn: mocks.begin, completeWorkspaceTurn: mocks.complete, cancelWorkspaceTurn: mocks.cancel, cancelRunningWorkspaceTurns: mocks.cancelRunning, isWorkspaceTurnCancelled: mocks.isCancelled }));
vi.mock("@/lib/project-agent/task-store", () => ({ readProjectAgentTask: mocks.readTask }));
vi.mock("@/lib/project-agent/runtime/workspace-engine", () => ({
	accessibleBoard: mocks.accessibleBoard, existingChatBoard: mocks.existingBoard, resolveBoard: mocks.resolveBoard,
	boardLinks: (boardId: string) => `Board: /workspace?id=${boardId}`, workspaceServiceKey: () => "service-key",
}));

import { cancelTaskWorkspaceTurns, runDirectWorkspace } from "@/lib/project-agent/runtime/workspace-direct";
import { newDirectState } from "@/lib/project-agent/runtime/workspace-direct-apply";
import type { RuntimeInput } from "@/lib/project-agent/runtime/run-agent";

const board = { id: "board-1", ownerEmail: "o@x.com", title: "Board" };
const snapshot = (revision = 4) => ({ revision, title: "Board", blocks: { b1: { id: "b1", type: "text", data: { markdown: "Hello" } } }, blockOrder: ["b1"], connectors: {} });
const task = (extra: Record<string, unknown> = {}) => ({ id: "pat_abc123def456", ownerEmail: "O@x.com", status: "running", steerNotes: [], workspaceBoardId: "board-1", ...extra });
const input = (extra: Partial<RuntimeInput> = {}) => ({ chatId: "chat-1", taskId: "pat_abc123def456", user: "u", ownerEmail: "o@x.com", userPrompt: "write a memo", query: "", workspaceState: newDirectState(), ...extra }) as RuntimeInput;
const createDoc = { type: "create_block", blockType: "doc", markdown: "# Memo" };
const apply = (actions: Record<string, unknown>[], extra: Partial<RuntimeInput> = {}) => runDirectWorkspace(input(extra), { action: "workspace_apply", actions });
const saved = (revision = 5) => ({ httpStatus: 200, body: { success: true, revision, actions: [{ type: "create_block", ids: ["doc-1"], changed: true }], notes: [] } });

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
	mocks.readTask.mockResolvedValue(task());
	mocks.readSnapshot.mockResolvedValue(snapshot());
	mocks.execute.mockResolvedValue(saved());
	mocks.begin.mockResolvedValue({ kind: "started" });
	mocks.complete.mockResolvedValue(true);
	mocks.cancel.mockResolvedValue("requested");
	mocks.cancelRunning.mockResolvedValue(1);
	mocks.isCancelled.mockResolvedValue(false);
	mocks.sign.mockResolvedValue({ token: "tok" });
	mocks.resolveBoard.mockResolvedValue({ board, created: false });
	mocks.existingBoard.mockResolvedValue(board);
	mocks.accessibleBoard.mockResolvedValue(board);
});

describe("runDirectWorkspace turn wiring", () => {
	it("begins a turn row, applies the batch and completes the row as completed", async () => {
		const outcome = await apply([createDoc]);
		expect(outcome.failed).toBeFalsy();
		expect(outcome.text).toContain("Saved 1 of 1 command(s)");
		expect(mocks.begin).toHaveBeenCalledWith({ boardId: "board-1", actorEmail: "o@x.com", turnId: expect.stringMatching(/^pa-pat_abc123def456-/) }, expect.any(Object));
		expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({ boardId: "board-1" }), expect.objectContaining({ status: "completed", focusBlockIds: ["doc-1"] }));
	});

	it("records a failed apply as failed, and a thrown executor as failed too", async () => {
		mocks.execute.mockResolvedValueOnce({ httpStatus: 422, body: { error: "not applied", reason: "action_not_applied", actions: [{ type: "create_block", ids: [], changed: false, reason: "No target" }] } });
		expect((await apply([createDoc])).failed).toBe(true);
		expect(mocks.complete).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ status: "failed" }));
		mocks.execute.mockRejectedValueOnce(new Error("boom"));
		await apply([createDoc]);
		expect(mocks.complete).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ status: "failed" }));
	});

	it("flags the turn cancelled when the task is aborted while the batch runs", async () => {
		const controller = new AbortController();
		mocks.execute.mockImplementationOnce(async () => { controller.abort(); return saved(); });
		await apply([createDoc], { signal: controller.signal });
		expect(mocks.cancel).toHaveBeenCalledWith(expect.objectContaining({ boardId: "board-1", actorEmail: "o@x.com" }));
	});

	it("flags the turn row of a board the task used when the task ends", async () => {
		await cancelTaskWorkspaceTurns("pat_abc123def456");
		expect(mocks.cancelRunning).toHaveBeenCalledWith("board-1", "o@x.com", "pa-pat_abc123def456-");
		mocks.cancelRunning.mockClear();
		mocks.readTask.mockResolvedValue(task({ workspaceBoardId: undefined }));
		await cancelTaskWorkspaceTurns("pat_abc123def456");
		expect(mocks.cancelRunning).not.toHaveBeenCalled();
	});
});

describe("runDirectWorkspace cancellation and ordering", () => {
	it("treats a task stopped in another process as cancelled before reading or executing", async () => {
		for (const stored of [task({ cancelled: true }), task({ status: "failed" })]) {
			mocks.readTask.mockResolvedValue(stored);
			const view = await runDirectWorkspace(input(), { action: "workspace_view" });
			expect(view).toMatchObject({ failed: true });
			expect(view.text).toContain("stopped");
			expect((await apply([createDoc])).text).toContain("stopped");
		}
		expect(mocks.readSnapshot).not.toHaveBeenCalled();
		expect(mocks.begin).not.toHaveBeenCalled();
		expect(mocks.resolveBoard).not.toHaveBeenCalled();
	});

	it("stops before executing when the stored task is stopped while the apply waits", async () => {
		mocks.readTask.mockResolvedValueOnce(task()).mockResolvedValue(task({ cancelled: true }));
		const outcome = await apply([createDoc]);
		expect(outcome.text).toContain("stopped before this batch ran");
		expect(mocks.execute).not.toHaveBeenCalled();
		expect(mocks.complete).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "failed" }));
	});

	it("rejects an empty or oversized batch and a reviewer's write before creating a board, a turn row or a token", async () => {
		for (const result of [await apply([]), await apply(Array.from({ length: 21 }, () => createDoc)), await apply([createDoc], { readOnly: true })]) expect(result.failed).toBe(true);
		expect(mocks.resolveBoard).not.toHaveBeenCalled();
		expect(mocks.sign).not.toHaveBeenCalled();
		expect(mocks.begin).not.toHaveBeenCalled();
		expect(mocks.readTask).not.toHaveBeenCalled();
	});

	it("lets a reviewer look at an existing board but never creates one", async () => {
		const view = await runDirectWorkspace(input({ readOnly: true }), { action: "workspace_view" });
		expect(view.text).toContain("view only");
		expect(mocks.readSnapshot).toHaveBeenCalledWith(expect.objectContaining({ canMutate: false }));
		expect(mocks.resolveBoard).not.toHaveBeenCalled();
		mocks.existingBoard.mockResolvedValue(null);
		const none = await runDirectWorkspace(input({ readOnly: true }), { action: "workspace_view" });
		expect(none.text).toContain("a reviewer cannot create one");
		expect(mocks.resolveBoard).not.toHaveBeenCalled();
	});

	it("lets a reviewer run read-only commands through apply", async () => {
		mocks.execute.mockResolvedValue({ httpStatus: 200, body: { success: true, revision: 4, actions: [{ type: "list_comments", ids: [], changed: false }], result: { comments: [] } } });
		const outcome = await apply([{ type: "list_comments" }], { readOnly: true });
		expect(outcome.failed).toBe(false);
		expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ canMutate: false }), expect.any(String), 1, 4, expect.any(Array));
	});
});

describe("runDirectWorkspace view and confirmation", () => {
	it("lets edits through only after the agent viewed the board", async () => {
		const edit = { type: "update_style", blockId: "b1", style: { fontSize: 20 } };
		const state = newDirectState();
		expect((await apply([edit], { workspaceState: state })).text).toContain("have not looked at this board");
		await runDirectWorkspace(input({ workspaceState: state }), { action: "workspace_view" });
		mocks.execute.mockResolvedValue({ httpStatus: 200, body: { success: true, revision: 5, actions: [{ type: "update_style", ids: ["b1"], changed: true }] } });
		expect((await apply([edit], { workspaceState: state })).text).toContain("Saved 1 of 1");
	});

	it("confirms sensitive actions against the user's latest message only", async () => {
		const share = { type: "share_board", email: "pat@example.com", role: "VIEWER", confirm: true };
		const workspaceState = newDirectState();
		await runDirectWorkspace(input({ workspaceState }), { action: "workspace_view" });
		mocks.readTask.mockResolvedValue(task({ steerNotes: ["Yes, confirm: share the board with pat@example.com as VIEWER", "Also make the title bigger"] }));
		const stale = await apply([share], { userPrompt: "share it with Pat", workspaceState });
		expect(stale.text).toContain("needs the user's explicit confirmation");
		expect(mocks.execute).not.toHaveBeenCalled();
		mocks.readTask.mockResolvedValue(task({ steerNotes: ["Also make the title bigger", "Yes, confirm: share the board with pat@example.com as VIEWER"] }));
		await apply([share], { userPrompt: "share it with Pat", workspaceState });
		expect(mocks.execute).toHaveBeenCalledTimes(1);
	});
});
