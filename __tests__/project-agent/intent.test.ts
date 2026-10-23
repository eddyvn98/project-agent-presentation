import { describe, expect, it } from "vitest";
import { shouldUseProjectAgent } from "@/lib/project-agent/intent";

describe("Project Agent task routing", () => {
	it.each([
		"Nghiên cứu chuyên sâu về thị trường phần mềm kế toán Việt Nam", // vi-allow: tests Vietnamese prompt routing
		"Tra cứu các nguồn chính thức về quy định mới", // vi-allow: tests Vietnamese prompt routing
		"Create a web page in HTML to explain these findings",
		"Create a one-slide PowerPoint file named review.pptx",
		"Export this brief to PPTX",
		"Tạo biểu đồ so sánh doanh thu theo quý", // vi-allow: tests Vietnamese prompt routing
		"Build a dashboard that visualizes the project metrics",
	])("routes tool-based work to the Project Agent: %s", (prompt) => {
		expect(shouldUseProjectAgent(prompt)).toBe(true);
	});

	it.each([
		"Giải thích giúp tôi khái niệm này", // vi-allow: tests Vietnamese prompt routing
		"What do you think about this idea?",
	])("keeps ordinary discussion in the project chat: %s", (prompt) => {
		expect(shouldUseProjectAgent(prompt)).toBe(false);
	});
});

import { requiresProjectAgentFileOutput as needsFile } from "@/lib/project-agent/intent";
describe("file output intent ignores file names in the prompt", () => {
	it("does not demand a file when csv is only the input name", () => {
		expect(needsFile("Viet ham Python doc sales_vn.csv va tra ve loi nhuan, kem unit test")).toBe(false);
		expect(needsFile("Write a function that reads data.csv and prints totals")).toBe(false);
		expect(needsFile("Tao file excel tu du lieu nay")).toBe(true);
		expect(needsFile("Create a PDF report of sales")).toBe(true);
	});
});
