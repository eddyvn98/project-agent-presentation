import { describe, expect, it } from "vitest";
import { decodeProjectAgentTaskCursor, encodeProjectAgentTaskCursor } from "@/lib/project-agent/task-pagination";

describe("Project Agent history cursors", () => {
	it("round-trips the stable timestamp and task id", () => {
		const cursor = { createdAt: "2026-10-14T06:28:27.000Z", id: "pat_93e961cfdfdc" };
		expect(decodeProjectAgentTaskCursor(encodeProjectAgentTaskCursor(cursor))).toEqual(cursor);
	});

	it("rejects malformed cursors and task ids", () => {
		expect(decodeProjectAgentTaskCursor(null)).toBeNull();
		expect(() => decodeProjectAgentTaskCursor("not-base64-json")).toThrow("Invalid Project Agent history cursor");
		expect(() => decodeProjectAgentTaskCursor(Buffer.from(JSON.stringify({
			createdAt: "2026-10-14T06:28:27.000Z",
			id: "another-project-task",
		})).toString("base64url"))).toThrow("Invalid Project Agent history cursor");
	});
});
