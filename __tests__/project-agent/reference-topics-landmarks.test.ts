import { describe, expect, it } from "vitest";
import { topicReferenceIds } from "@/lib/project-agent/runtime/reference-topics";

describe("topicReferenceIds", () => {
	it("does not treat a landmark as a regulation topic", () => {
		expect(topicReferenceIds("Tôi là tiệm văn phòng phẩm trên đường Vườn Lài, gần cây xăng và trường mẫu giáo. Tìm đối thủ cùng đường.", ["VN"])).toEqual([]); // vi-allow
		expect(topicReferenceIds("My shop is next to the kindergarten and opposite the petrol station", ["VN"])).toEqual([]);
	});

	it("still finds the standards when the school itself is the subject", () => {
		expect(topicReferenceIds("Yêu cầu thiết kế trường mẫu giáo tại Việt Nam", ["VN"])).toContain("thong-tu-13-2020-tt-bgddt"); // vi-allow
		expect(topicReferenceIds("Fire exits for a kindergarten building near a school", ["VN"])).toContain("qcvn-06-2022-bxd");
	});
});
