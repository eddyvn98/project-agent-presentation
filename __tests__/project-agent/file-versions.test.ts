import { describe, expect, it } from "vitest";
import { fileVersions } from "@/lib/project-agent/file-versions";

const task = (id: string, status: string, names: string[]) => ({ id, status, files: names.map((name) => ({ id: `${id}-${name}`, name, mimeType: "x", size: 1 })) });

describe("file versions", () => {
	it("numbers same-named files across finished tasks", () => {
		const result = fileVersions([task("a", "done", ["deck.pptx", "n.md"]), task("b", "failed", ["deck.pptx"]), task("c", "done", ["deck.pptx"])], "deck.pptx");
		expect(result.map((version) => [version.task.id, version.number])).toEqual([["a", 1], ["c", 2]]);
		expect(fileVersions([], "x")).toEqual([]);
	});
});
