import { describe, expect, it } from "vitest";
import { sanitizeChatTitle } from "@/lib/project-agent/chat-title";

describe("sanitizeChatTitle", () => {
	it("strips quotes, markdown, prefixes and trailing punctuation", () => {
		expect(sanitizeChatTitle('"Báo cáo doanh thu quý 4."')).toBe("Báo cáo doanh thu quý 4");
		expect(sanitizeChatTitle("**Title:** Remote work pros and cons")).toBe("Remote work pros and cons");
		expect(sanitizeChatTitle("Tiêu đề: Kế hoạch ra mắt\nGiải thích thêm...")).toBe("Kế hoạch ra mắt");
	});
	it("rejects empty text and sentences, and truncates very long titles", () => {
		expect(sanitizeChatTitle("")).toBeNull();
		expect(sanitizeChatTitle(null)).toBeNull();
		expect(sanitizeChatTitle("a")).toBeNull();
		expect(sanitizeChatTitle("this is clearly a long sentence the model wrote instead of a short title ok")).toBeNull();
		expect(sanitizeChatTitle("x".repeat(80))!.length).toBe(58);
	});
});

import { safeFileName } from "@/lib/project-agent/files";

describe("safeFileName", () => {
	it("keeps only the trailing file name of descriptive link text", () => {
		expect(safeFileName("Download chart-q1.svg", "https://x/f/abc")).toBe("chart-q1.svg");
		expect(safeFileName("Chart download: chart-q1.svg", "https://x/f/abc")).toBe("chart-q1.svg");
		expect(safeFileName("report.docx", "https://x/f/abc")).toBe("report.docx");
		expect(safeFileName("Open the report", "https://x/files/abc.pdf")).toBe("Open the report");
		expect(safeFileName("", "https://x/files/abc.pdf")).toBe("abc.pdf");
	});
});
