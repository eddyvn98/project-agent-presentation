import { describe, expect, it } from "vitest";
import { repairOngUiFences } from "@/lib/project-agent/rich-ui";

describe("repairOngUiFences", () => {
	it("restores the fence when the model wrote the label and JSON without backticks", () => {
		const text = 'Done.\n\nong-ui\n{"type":"followups","items":[]}';
		expect(repairOngUiFences(text)).toBe('Done.\n\n```ong-ui\n{"type":"followups","items":[]}\n```');
	});
	it("leaves already fenced blocks and normal prose alone", () => {
		const fenced = '```ong-ui\n{"type":"followups","items":[]}\n```';
		expect(repairOngUiFences(fenced)).toBe(fenced);
		expect(repairOngUiFences("The ong-ui format is documented.")).toBe("The ong-ui format is documented.");
	});
});
