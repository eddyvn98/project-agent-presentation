import { describe, expect, it } from "vitest";
import { classifyProjectAgentInputFile } from "@/lib/project-agent/task-inputs";

describe("classifyProjectAgentInputFile", () => {
	it("classifies supported Office, PDF, text, and image inputs", () => {
		expect(classifyProjectAgentInputFile({ name: "brief.pdf", type: "application/pdf" })).toEqual({ mimeType: "application/pdf", type: "document" });
		expect(classifyProjectAgentInputFile({ name: "plan.docx", type: "" })).toEqual({
			mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", type: "document",
		});
		expect(classifyProjectAgentInputFile({ name: "photo.png", type: "image/png" })).toEqual({ mimeType: "image/png", type: "image" });
	});

	it("rejects media formats that Dify Project Agent cannot inspect", () => {
		expect(() => classifyProjectAgentInputFile({ name: "meeting.mp4", type: "video/mp4" })).toThrow("does not support the attached file format");
	});

	it.each([
		["sample.jsonl", "application/x-ndjson"],
		["sample.yaml", "application/yaml"],
		["sample.yml", "application/yaml"],
		["sample.svg", "image/svg+xml"],
	] as const)("accepts %s uploads", (name, type) => {
		expect(classifyProjectAgentInputFile({ name, type })).toEqual({ mimeType: type, type: "document" });
	});
});
