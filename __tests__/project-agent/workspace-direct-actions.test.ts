import { describe, expect, it } from "vitest";
import { parseRuntimeActions } from "@/lib/project-agent/runtime/actions";
import { allowedEngines, engineRefusal } from "@/lib/project-agent/runtime/engines";
import { runtimeTaskInstructions } from "@/lib/project-agent/runtime/instructions";
import { describeWorkspaceCommands } from "@/lib/project-agent/runtime/workspace-direct-commands";
import { formatBoardView } from "@/lib/project-agent/runtime/workspace-direct-context";

describe("direct workspace actions", () => {
	it("parses workspace_commands, workspace_view and workspace_apply", () => {
		expect(parseRuntimeActions('{"action":"workspace_commands","categories":["table"," presentation ",7]}')).toEqual([{ action: "workspace_commands", categories: ["table", "presentation"], query: undefined, note: undefined }]);
		expect(parseRuntimeActions('{"action":"workspace_commands","query":"make a slide deck"}')).toMatchObject([{ action: "workspace_commands", query: "make a slide deck" }]);
		expect(parseRuntimeActions('{"action":"workspace_view","blockIds":["a","b"]}')).toMatchObject([{ action: "workspace_view", blockIds: ["a", "b"] }]);
		const apply = parseRuntimeActions('{"action":"workspace_apply","revision":4,"actions":[{"type":"create_block","blockType":"doc","markdown":"# Hi {x}"},{"type":"rename_board","title":"T"}]}');
		expect(apply).toMatchObject([{ action: "workspace_apply", revision: 4, actions: [{ type: "create_block" }, { type: "rename_board", title: "T" }] }]);
	});

	it("rejects a workspace_apply without command objects", () => {
		for (const bad of ['{"action":"workspace_apply"}', '{"action":"workspace_apply","actions":[]}', '{"action":"workspace_apply","actions":["x"]}', '{"action":"workspace_apply","actions":[{"title":"no type"}]}']) {
			expect(parseRuntimeActions(bad)).toHaveProperty("error");
		}
	});

	it("reads the array parameters of a tool-call markup reply", () => {
		const xml = '<invoke name="workspace_apply"><parameter name="actions">[{"type":"rename_board","title":"T"}]</parameter><parameter name="revision">3</parameter></invoke>';
		expect(parseRuntimeActions(xml)).toMatchObject([{ action: "workspace_apply", revision: 3, actions: [{ type: "rename_board" }] }]);
	});

	it("treats a lone string as a one-element list and converts numeric revisions, but rejects bad ones", () => {
		expect(parseRuntimeActions('{"action":"workspace_commands","categories":"table"}')).toMatchObject([{ categories: ["table"] }]);
		expect(parseRuntimeActions('{"action":"workspace_view","blockIds":"doc1"}')).toMatchObject([{ blockIds: ["doc1"] }]);
		const apply = (revision: string) => parseRuntimeActions(`{"action":"workspace_apply","revision":${revision},"actions":[{"type":"rename_board","title":"T"}]}`);
		expect(apply('"7"')).toMatchObject([{ revision: 7 }]);
		expect(apply("null")).toMatchObject([{ revision: undefined }]);
		for (const bad of ['"abc"', "1.5", "-2", "true", '{"a":1}']) expect(apply(bad)).toHaveProperty("error");
	});

	it("gates the three actions by the Workspace module, including tasks saved before they existed", async () => {
		expect(await allowedEngines(async (module) => new Set([module]))).toEqual(expect.arrayContaining(["workspace_commands", "workspace_view", "workspace_apply"]));
		expect(await allowedEngines(async () => new Set())).toEqual([]);
		expect(engineRefusal([], "workspace_apply")).toMatch(/not available/);
		expect(engineRefusal(["generate_image"], "workspace_view")).toMatch(/not available/);
		expect(engineRefusal(["workspace_read"], "workspace_apply")).toBeNull();
		expect(engineRefusal(undefined, "workspace_apply")).toBeNull();
	});
});

describe("agent instructions", () => {
	it("describe the direct board actions and no request-delegation action", () => {
		const text = runtimeTaskInstructions();
		expect(text).toContain("workspace_apply");
		expect(text).not.toContain("hands a request to the Workspace Agent");
		expect(text).toContain("DELIVERABLE FORMAT:");
	});
});

describe("workspace_commands", () => {
	it("returns the commands and signatures of the requested categories only", () => {
		const table = describeWorkspaceCommands({ categories: ["table"] });
		expect(table.failed).toBeUndefined();
		expect(table.text).toContain("## table");
		expect(table.text).toMatch(/- update_table_cells \{[^}]*blockId\*:string/);
		expect(table.text).not.toContain("## presentation");
		const slides = describeWorkspaceCommands({ categories: ["presentation"] });
		expect(slides.text).toContain("create_slide_deck");
		expect(slides.text).toContain("Frames line of workspace_view");
	});

	it("explains boards in terms of workspace_view and workspace_apply, not the older agent's board summary", () => {
		const everything = describeWorkspaceCommands({ categories: ["content", "table", "presentation", "board", "video_flow", "collaboration"] }).text;
		for (const old of ["board.blocks", "board.frames", "docText", "docLines", "tableMeta", "slideIds=", "workspace_read", "workspace_knowledge_search", "board summary", "pass confirm true", "retry with confirmBulkDelete"]) expect(everything).not.toContain(old);
		expect(everything).toContain("workspace_view blockIds:[<table id>]");
		expect(everything).toContain("confirmBulkDelete:true");
		expect(describeWorkspaceCommands({ query: "build a slide deck" }).text).not.toContain("board.blocks");
	});

	it("picks categories from a query, and answers an unmatched request with the category menu", () => {
		expect(describeWorkspaceCommands({ query: "build a slide deck for the board meeting" }).text).toContain("## presentation");
		const none = describeWorkspaceCommands({ categories: ["bogus"] });
		expect(none.failed).toBe(true);
		expect(none.text).toContain("Unknown categories: bogus");
		expect(none.text).toContain("Categories:");
		expect(describeWorkspaceCommands({ query: "zzzz qqqq" }).failed).toBe(true);
	});
});

describe("workspace_view", () => {
	const board = {
		revision: 9, title: "Plan",
		blocks: {
			doc1: { id: "doc1", type: "doc", data: { html: '<h1 data-line-id="l1">Memo</h1><p data-line-id="l2">Body text</p>' } },
			t1: { id: "t1", type: "table", data: { rows: 2, cols: 2, cells: [["a", "b"], ["c", "d"]] } },
		},
		blockOrder: ["doc1", "t1"], connectors: {},
	};

	it("lists blocks compactly and shows requested blocks in full", () => {
		const overview = formatBoardView(board, { canMutate: true, links: "Board: /workspace?id=x" });
		expect(overview).toContain('Board "Plan", revision 9, you can edit it.');
		expect(overview).toContain("- doc1 [doc]");
		expect(overview).toContain("- t1 [table]");
		expect(overview).toContain("Add blockIds");
		const full = formatBoardView(board, { canMutate: false, links: "Board: /workspace?id=x", blockIds: ["doc1"] });
		expect(full).toContain("view only");
		expect(full).toContain("Requested blocks in full:");
		expect(full).toContain("l2: Body text");
		expect(formatBoardView({ ...board, blocks: {}, blockOrder: [] }, { canMutate: true, links: "" })).toContain("The board is empty.");
	});

	it("shows every sheet id of a table in full", () => {
		const sheets = Array.from({ length: 12 }, (_, index) => ({ id: `sheet-${String(index).padStart(2, "0")}-aaaaaaaaaaaaaaaaaaaa`, name: `Quarter ${index}`, data: { rows: 3, cols: 4 } }));
		const view = formatBoardView({ ...board, blocks: { ...board.blocks, t1: { id: "t1", type: "table", data: { rows: 2, cols: 2, cells: [["a"]], sheets } } } }, { canMutate: true, links: "" });
		for (const sheet of sheets) expect(view).toContain(`${sheet.id} "${sheet.name}" 3x4`);
	});
});
