import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectRefresh, applyProposal, readEntry, writeOverlay } from "../../scripts/reference-refresh-lib.mjs";
import { buildTaskReferenceProposal } from "@/lib/project-agent/runtime/reference-candidates";
import { isReferencePrefetchQuery, pickReferences, prefetchReference } from "@/lib/project-agent/runtime/reference-prefetch";
import { requestJurisdictions, topicReferenceIds } from "@/lib/project-agent/runtime/reference-topics";
import { findReference, mergeReferences, parseReference, searchReferences, type ReferenceEntry } from "@/lib/project-agent/reference-library";

const tmp: string[] = [];
const entry = (overrides: Partial<ReferenceEntry> = {}): ReferenceEntry => ({ id: "qcvn-06", code: "QCVN 06:2022/BXD", title: "An toàn cháy cho nhà và công trình", jurisdiction: "VN", domain: ["fire"], issuedBy: "BXD", status: "current", sourceUrl: "https://moc.gov.vn/qcvn-06", license: "public-law", body: "## 1.1 Phạm vi\nQuy chuẩn an toàn cháy cho công trình.", ...overrides });
const md = (values: string) => `---\nid: test\ncode: TCVN 1\ntitle: Test\njurisdiction: VN\ndomain: [fire]\nissuedBy: BXD\nstatus: current\nsourceUrl: https://moc.gov.vn/test\nlicense: public-law\n---\nbody`;
afterEach(async () => { await Promise.all(tmp.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))); });

describe("reference library", () => {
	it("prefetches references only for explicit code questions", () => {
		expect(isReferencePrefetchQuery("Is QCVN 06:2022/BXD current?" )).toBe(true);
		expect(isReferencePrefetchQuery("Design a family house with four bedrooms")).toBe(false);
		expect(isReferencePrefetchQuery("Design a family house\n\nExamples include QCVN 01:2021/BXD and IBC")).toBe(false);
	});
	it("does not cite metadata-only international entries before web verification", async () => {
		const result = await prefetchReference("Compare IBC requirements with the UK code.");
		expect(result?.sources).toEqual([]);
		expect(result?.text).toContain("metadata-only");
	});
	it("validates source URL and status in front matter", () => {
		expect(parseReference(md("ok")).id).toBe("test");
		expect(() => parseReference(md("ok").replace("sourceUrl: https://moc.gov.vn/test\n", ""))).toThrow("sourceUrl");
		expect(() => parseReference(md("ok").replace("status: current", "status: stale"))).toThrow("status");
	});
	it("lets runtime overlay replace the seed entry by id", () => {
		const result = mergeReferences([entry()], [entry({ title: "Overlay title" })]);
		expect(result).toHaveLength(1);
		expect(result[0].title).toBe("Overlay title");
	});
	it("matches Vietnamese without diacritics and ranks superseded editions lower", () => {
		const old = entry({ id: "old", code: "QCVN 06:2021/BXD", status: "superseded", supersededBy: ["qcvn-06"] });
		expect(searchReferences([old, entry()], "an toan chay").map((item) => item.id)).toEqual(["qcvn-06", "old"]);
	});
	it("returns matching sections for find and marks supersession", () => {
		const old = entry({ status: "superseded", supersededBy: ["qcvn-06-2022"] });
		expect(findReference(old, "phạm vi")).toContain("1.1");
		expect(findReference(old, "missing")).toBe("No matching passage found.");
	});
});

describe("reference refresh", () => {
	it("detects a newer edition, an amendment, and no change from fixture text", () => {
		const current = entry();
		expect(detectRefresh(current, "Văn bản ban hành QCVN 06:2026/BXD thay thế quy chuẩn cũ", "https://moc.gov.vn/new")?.proposed.code).toBe("QCVN 06:2026/BXD");
		const upcoming = detectRefresh(current, "Ban hành QCVN 06:2026/BXD, có hiệu lực từ ngày 01/01/2027", "https://moc.gov.vn/upcoming");
		expect(upcoming?.proposed.status).toBe("draft");
		expect(upcoming?.proposed.effective).toBe("2027-01-01");
		expect(detectRefresh(current, "Sửa đổi 1:2023 QCVN 06:2022/BXD", "https://moc.gov.vn/amend")?.proposed.amendments).toContain("Sửa đổi 1:2023 QCVN 06:2022/BXD");
		expect(detectRefresh(current, "Thông tin chung không nhắc thay thế hay sửa đổi", "https://moc.gov.vn/quiet")).toBeNull();
	});
	it("approves by writing overlay precedence and rejects without applying", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reference-refresh-")); tmp.push(dir);
		const old = entry();
		await writeOverlay(dir, old);
		const proposed = { ...old, id: "qcvn-06-2026", code: "QCVN 06:2026/BXD" };
		const proposal = { type: "update", old, proposed };
		await applyProposal({ type: "update", old, proposed: { ...proposed, id: "qcvn-06-2027", status: "draft", effective: "2027-01-01" } }, "approved", dir);
		expect((await readEntry(path.join(dir, "qcvn-06.md"))).status).toBe("current");
		await applyProposal(proposal, "approved", dir);
		expect((await readEntry(path.join(dir, "qcvn-06.md"))).status).toBe("superseded");
		expect((await readEntry(path.join(dir, "qcvn-06-2026.md"))).code).toBe("QCVN 06:2026/BXD");
		const rejected = await applyProposal(proposal, "rejected", dir);
		expect(rejected.state).toBe("rejected");
	});
	it("accepts an official task page as a review candidate", () => {
		const proposal = buildTaskReferenceProposal("QCVN 18:2021/BXD", "https://moc.gov.vn/page", "QCVN 18:2021/BXD text", ["QCVN 06:2022/BXD"]);
		expect(proposal?.fromTask).toBe(true);
		expect(buildTaskReferenceProposal("QCVN 18:2021/BXD", "https://example.com/page", "", [])).toBeNull();
	});
});

describe("reference ranking", () => {
	it("matches Vietnamese names without diacritics and lists the replacement of a superseded law first", () => {
		const old = entry({ id: "law-2014", code: "Law 50/2014/QH13", title: "Law on Construction", status: "superseded", supersededBy: ["law-2025"], watch: ["Luật Xây dựng 2014"], body: "" }); // vi-allow
		const next = entry({ id: "law-2025", code: "Law 135/2025/QH15", title: "Law on Construction", watch: ["Luật Xây dựng 2025"], body: "" }); // vi-allow
		const other = entry({ id: "energy", code: "QCVN 09:2017/BXD", title: "Energy efficiency", watch: [], body: "" });
		expect(searchReferences([old, other, next], "luat xay dung 2014").map((item) => item.id)).toEqual(["law-2025", "law-2014"]);
		expect(searchReferences([other, next], "Luật xây dựng").map((item) => item.id)[0]).toBe("law-2025"); // vi-allow
	});
});

describe("topical reference prefetch", () => {
	it("pulls planning entries and their next edition for a plot question that names no code", () => {
		const current = entry({ id: "qcvn-01-2021-bxd", code: "QCVN 01:2021/BXD", title: "Construction planning", supersededBy: ["qcvn-01-2026-bxd"] });
		const next = entry({ id: "qcvn-01-2026-bxd", code: "QCVN 01:2026/BXD", title: "Urban and rural planning", status: "draft", supersedes: ["qcvn-01-2021-bxd"] });
		const other = entry({ id: "qcvn-06-2022-bxd", code: "QCVN 06:2022/BXD" });
		const question = "Lô đất nhà phố 5 x 20 m, mật độ xây dựng tối đa bao nhiêu?"; // vi-allow
		expect(isReferencePrefetchQuery(question)).toBe(true);
		expect(pickReferences([current, next, other], question, ["VN"]).map((item) => item.id)).toEqual(["qcvn-01-2021-bxd", "qcvn-01-2026-bxd"]);
		expect(pickReferences([current, next, other], "Thoát nạn khi cháy cho nhà 5 tầng", ["VN"]).map((item) => item.id)).toEqual(["qcvn-06-2022-bxd"]); // vi-allow
	});
});

describe("reference jurisdiction", () => {
	it("uses the jurisdiction the request or project names and never assumes Vietnam for other places", () => {
		expect(requestJurisdictions("Fire escape travel distance for a 5-storey office in Singapore")).toEqual(["SG"]);
		expect(requestJurisdictions("Khoảng cách thoát nạn cho văn phòng 5 tầng ở Singapore")).toEqual(["SG"]); // vi-allow
		expect(requestJurisdictions("Max travel distance for an office?")).toEqual([]);
		expect(requestJurisdictions("Max travel distance for an office?", "Hotel project in Austin, Texas")).toEqual(["US"]);
		expect(requestJurisdictions("Chiều rộng hành lang thoát nạn tối thiểu?")).toEqual(["VN"]); // vi-allow
		expect(topicReferenceIds("fire escape width", ["SG"])).toEqual([]);
		expect(topicReferenceIds("fire escape width", ["US"])).toEqual(["ibc-2024", "ifc-2024", "nfpa-101-2024"]);
		expect(isReferencePrefetchQuery("Instructions...\n\nUser request:\nMax travel distance for an office in London?\n\nBefore you finish: notes")).toBe(true);
		expect(isReferencePrefetchQuery("Instructions mention QCVN 06 here\n\nUser request:\nDesign a logo for our firm")).toBe(false);
	});
});
