import { describe, expect, it } from "vitest";
import { touchesOnlyNewContent } from "@/lib/project-agent/runtime/workspace-direct-prepare";
import type { WorkspaceBoardSnapshot } from "@/lib/workspace-agent/contracts";

const board = (blocks: Record<string, unknown>) => ({ revision: 3, blocks } as unknown as WorkspaceBoardSnapshot);

describe("touchesOnlyNewContent", () => {
	it("allows any batch on an empty board", () => {
		expect(touchesOnlyNewContent([{ type: "update_block", blockId: "x", content: "a" }], board({}))).toBe(true);
	});
	it("allows edits that target only blocks created earlier in the batch", () => {
		const batch = [{ type: "create_block", id: "memo", blockType: "doc" }, { type: "update_block", blockId: "memo", content: "a" }];
		expect(touchesOnlyNewContent(batch, board({ old: {} }))).toBe(true);
	});
	it("refuses edits of existing blocks and board-level commands without targets", () => {
		expect(touchesOnlyNewContent([{ type: "create_block", id: "n" }, { type: "update_block", blockId: "old", content: "a" }], board({ old: {} }))).toBe(false);
		expect(touchesOnlyNewContent([{ type: "set_board_title", title: "T" }], board({ old: {} }))).toBe(false);
	});
});
