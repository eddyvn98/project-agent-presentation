import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/capabilities/project", () => ({ getProject: vi.fn(), readKnowledgeOriginal: vi.fn() }));
vi.mock("@/lib/project-agent/visual-review", () => ({ renderProjectAgentFile: vi.fn() }));
vi.mock("@/lib/project-agent/dify-input-files", () => ({ uploadProjectAgentReviewFile: vi.fn() }));
vi.mock("@/lib/project-agent/task-store", () => ({ readProjectAgentFile: vi.fn() }));

import { findReferenceSource } from "@/lib/project-agent/reference-review";

const sources = [{ id: "1", name: "OOG_template.docx" }, { id: "2", name: "data.xlsx" }, { id: "3", name: "Other.docx" }];

describe("findReferenceSource", () => {
	it("picks the same-type source named in the request", () => expect(findReferenceSource("format it like OOG_template.docx please", sources, "out.docx")?.id).toBe("1"));
	it("ignores sources of another type", () => expect(findReferenceSource("use OOG_template.docx", sources, "out.xlsx")).toBeUndefined());
	it("returns nothing when no source is named", () => expect(findReferenceSource("write a report", sources, "out.docx")).toBeUndefined());
});
