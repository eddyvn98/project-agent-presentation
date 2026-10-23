import { describeWorkspaceCommands } from "@/lib/project-agent/runtime/workspace-direct-commands";
import { describe, expect, it } from "vitest";

describe("Project Agent presentation guidance", () => {
	it("directs slide creation toward editable Scene V2 compositions", () => {
		const result = describeWorkspaceCommands({ categories: ["presentation"] });

		expect(result.failed).toBeUndefined();
		expect(result.text).toContain("editable Scene V2 data");
		expect(result.text).toContain("composition:hero|split|metric|statement|columns");
		expect(result.text).toContain("designStyle:editorial|technology|minimal|playful");
	});
});
