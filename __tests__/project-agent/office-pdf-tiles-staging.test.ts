import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dir: "" }));
vi.mock("@/lib/workspace/resource-storage", () => ({ diskPathFor: (key: string) => `${state.dir}/store/${key}`, resolveBackend: () => "disk", getOssClient: () => ({}) }));

import { stageDocument } from "@/lib/office/pdf-tiles";

describe("staging a stored PDF for the render container", () => {
	beforeAll(async () => {
		state.dir = mkdtempSync(path.join(os.tmpdir(), "stage-"));
		vi.spyOn(process, "cwd").mockReturnValue(state.dir);
		const fs = await import("node:fs/promises");
		await fs.mkdir(path.join(state.dir, "store"), { recursive: true });
		await fs.mkdir(path.join(state.dir, "data", "pdf-render", "docs"), { recursive: true });
	});
	afterAll(() => { vi.restoreAllMocks(); rmSync(state.dir, { recursive: true, force: true }); });

	it("many concurrent first requests for one version never truncate the stored original", async () => {
		const original = Buffer.alloc(300_000, 7);
		writeFileSync(path.join(state.dir, "store", "v-1"), original);
		const results = await Promise.all(Array.from({ length: 12 }, () => stageDocument({ versionId: "ver-1", storageKey: "v-1" })));
		expect(new Set(results).size).toBe(1);
		expect(statSync(path.join(state.dir, "store", "v-1")).size).toBe(300_000);
		const staged = path.join(state.dir, "data", "pdf-render", "docs", path.basename(results[0]));
		expect(readFileSync(staged).equals(original)).toBe(true);
	});
	it("replaces an empty leftover instead of serving it", async () => {
		writeFileSync(path.join(state.dir, "store", "v-2"), Buffer.alloc(5000, 1));
		const first = await stageDocument({ versionId: "ver-2", storageKey: "v-2" });
		const staged = path.join(state.dir, "data", "pdf-render", "docs", path.basename(first));
		rmSync(staged);
		writeFileSync(staged, "");
		await stageDocument({ versionId: "ver-2", storageKey: "v-2" });
		expect(statSync(staged).size).toBe(5000);
	});
});
