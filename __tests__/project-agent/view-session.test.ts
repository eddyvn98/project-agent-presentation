import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearProjectAgentCanvasSelection, consumeProjectAgentInitialFiles, consumeProjectAgentInitialPrompt, getProjectAgentCanvasSelection, setProjectAgentCanvasSelection, setProjectAgentInitialPrompt } from "@/lib/project-agent/view-session";

function memoryStorage(): Storage {
	const values = new Map<string, string>();
	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => { values.set(key, value); },
		removeItem: (key) => { values.delete(key); },
		clear: () => values.clear(),
		key: (index) => [...values.keys()][index] ?? null,
		get length() { return values.size; },
	};
}

describe("Project Agent initial chat handoff", () => {
	beforeEach(() => vi.stubGlobal("window", { localStorage: memoryStorage(), sessionStorage: memoryStorage(), dispatchEvent: vi.fn() }));
	afterEach(() => vi.unstubAllGlobals());

	it("hands the starter message and selected files to the new conversation once", () => {
		const file = { name: "brief.pdf" } as File;
		setProjectAgentInitialPrompt("project-1", "Summarize this", [file]);

		expect(consumeProjectAgentInitialPrompt("project-1")).toBe("Summarize this");
		expect(consumeProjectAgentInitialFiles("project-1")).toEqual([file]);
		expect(consumeProjectAgentInitialFiles("project-1")).toEqual([]);
	});

	it("restores a canvas selection only for its conversation", () => {
		const selection = { conversationId: "conversation-1", taskId: "task-1", fileId: "file-1" };
		setProjectAgentCanvasSelection("project-1", selection);

		expect(getProjectAgentCanvasSelection("project-1", "conversation-1")).toEqual(selection);
		expect(getProjectAgentCanvasSelection("project-1", "conversation-2")).toBeNull();
		clearProjectAgentCanvasSelection("project-1", "conversation-2");
		expect(getProjectAgentCanvasSelection("project-1", "conversation-1")).toEqual(selection);
		clearProjectAgentCanvasSelection("project-1", "conversation-1", "task-1", "file-1");
		expect(getProjectAgentCanvasSelection("project-1", "conversation-1")).toBeNull();
	});
});
