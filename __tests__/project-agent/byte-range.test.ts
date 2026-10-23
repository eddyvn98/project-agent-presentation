import { describe, expect, it } from "vitest";
import { parseByteRange } from "@/lib/project-agent/byte-range";

describe("parseByteRange", () => {
	it("reads closed, open-ended and suffix ranges", () => {
		expect(parseByteRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
		expect(parseByteRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
		expect(parseByteRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
		expect(parseByteRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
	});
	it("ignores what it cannot serve and rejects what lies outside the file", () => {
		expect(parseByteRange(null, 1000)).toBeNull();
		expect(parseByteRange("items=0-5", 1000)).toBeNull();
		expect(parseByteRange("bytes=0-5,10-20", 1000)).toBeNull();
		expect(parseByteRange("bytes=2000-3000", 1000)).toBe("invalid");
		expect(parseByteRange("bytes=50-10", 1000)).toBe("invalid");
	});
});
