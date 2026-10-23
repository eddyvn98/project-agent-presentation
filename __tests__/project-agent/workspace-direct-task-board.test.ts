import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	accessibleBoard: vi.fn(),
	resolveBoard: vi.fn(),
	applyBatch: vi.fn(),
	role: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { workspaceBoard: { findUnique: vi.fn(async () => ({ blocks: {} })) } } }));
vi.mock("@/lib/workspace/agentAuth", () => ({ signWorkspaceAgentUserToken: vi.fn(async () => ({ token: "t" })) }));
vi.mock("@/app/api/workspaces/_access", () => ({ resolveAccessRole: mocks.role }));
vi.mock("@/lib/workspace-agent/workspaceExecutor", () => ({ executeWorkspaceActions: vi.fn(), readWorkspaceSnapshot: vi.fn(async () => ({ revision: 1, blocks: {}, blockOrder: [], connectors: [] })) }));
vi.mock("@/lib/workspace-agent/turnStore", () => ({
	beginWorkspaceTurn: vi.fn(async () => ({ kind: "started" })),
	cancelWorkspaceTurn: vi.fn(),
	completeWorkspaceTurn: vi.fn(async () => true),
	isWorkspaceTurnCancelled: vi.fn(async () => false),
}));
vi.mock("@/lib/project-agent/task-store", () => ({ readProjectAgentTask: vi.fn(async () => null) }));
vi.mock("@/lib/project-agent/runtime/workspace-engine", () => ({
	accessibleBoard: mocks.accessibleBoard,
	resolveBoard: mocks.resolveBoard,
	boardLinks: vi.fn(async () => "Board: /workspace?id=b"),
	workspaceServiceKey: () => "key",
}));
vi.mock("@/lib/project-agent/runtime/workspace-direct-apply", async () => {
	const actual = await vi.importActual<typeof import("@/lib/project-agent/runtime/workspace-direct-apply")>("@/lib/project-agent/runtime/workspace-direct-apply");
	return { ...actual, applyWorkspaceBatch: mocks.applyBatch };
});
vi.mock("@/lib/project-agent/runtime/workspace-direct-context", () => ({ formatBoardView: () => "view" }));

import { runDirectWorkspace } from "@/lib/project-agent/runtime/workspace-direct";
import { newDirectState } from "@/lib/project-agent/runtime/workspace-direct-apply";

const base = () => ({ chatId: "chat", taskId: "pat_1", projectId: "proj_1", user: "u", ownerEmail: "owner@example.com", query: "q", workspaceState: newDirectState() });
const board = (id: string) => ({ id, ownerEmail: "owner@example.com", title: "T" });

describe("workspace commands on a task bound to a board", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.role.mockResolvedValue("OWNER");
		mocks.accessibleBoard.mockImplementation(async (id: string) => board(id));
		mocks.resolveBoard.mockResolvedValue({ board: board("chat-board"), created: true });
	});

	it("uses the task's board instead of the chat's own board, after the access check", async () => {
		const outcome = await runDirectWorkspace({ ...base(), boardId: "bound" }, { action: "workspace_view" });
		expect(mocks.accessibleBoard).toHaveBeenCalledWith("bound", "owner@example.com");
		expect(mocks.resolveBoard).not.toHaveBeenCalled();
		expect(outcome.boardId).toBe("bound");
	});

	it("refuses a bound board the owner cannot open", async () => {
		mocks.accessibleBoard.mockResolvedValue(null);
		const outcome = await runDirectWorkspace({ ...base(), boardId: "bound" }, { action: "workspace_view" });
		expect(outcome.failed).toBe(true);
		expect(mocks.resolveBoard).not.toHaveBeenCalled();
	});

	it("lets the agent name another board explicitly", async () => {
		await runDirectWorkspace({ ...base(), boardId: "bound" }, { action: "workspace_view", board: "named" });
		expect(mocks.accessibleBoard).toHaveBeenCalledWith("named", "owner@example.com");
	});

	it("creates the chat's board inside the task's project when no board is bound", async () => {
		await runDirectWorkspace(base(), { action: "workspace_view" });
		expect(mocks.resolveBoard).toHaveBeenCalledWith("chat", "owner@example.com", expect.objectContaining({ projectId: "proj_1" }));
	});

	it("reports saved board changes to the task through onWorkspaceSaved", async () => {
		// The real applyWorkspaceBatch records saves in the task state; the mock does the same.
		mocks.applyBatch.mockImplementationOnce(async (ctx: { state: { saved: number; focusIds: string[] } }) => { ctx.state.saved += 1; ctx.state.focusIds.push("b1"); return { text: "Saved 1 of 1 command(s)\n1. create_block saved (ids: b1)", saved: 1, focusIds: ["b1"], summaries: ["Plan"], failed: false }; });
		const onWorkspaceSaved = vi.fn();
		const input = { ...base(), boardId: "bound", onWorkspaceSaved };
		await runDirectWorkspace(input, { action: "workspace_apply", actions: [{ type: "create_block" }] });
		expect(onWorkspaceSaved).toHaveBeenCalledWith({ boardId: "bound", saved: 1, focusIds: ["b1"], summaries: ["Plan"] });
		mocks.applyBatch.mockResolvedValue({ text: "nothing", saved: 0, focusIds: [], failed: true });
		await runDirectWorkspace(input, { action: "workspace_apply", actions: [{ type: "create_block" }] });
		expect(onWorkspaceSaved).toHaveBeenCalledTimes(1);
	});
});
