import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { quotaMessage } from "@/lib/project-agent/runtime/workspace-quota";

describe("workspace quota", () => {
	afterEach(() => vi.unstubAllEnvs());
	it("blocks commands over the cap but lets cleanup run", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "quota-"));
		await writeFile(path.join(directory, "big.bin"), Buffer.alloc(2 * 1024 * 1024));
		vi.stubEnv("PROJECT_AGENT_WORKSPACE_MAX_MB", "1");
		expect(await quotaMessage(directory, "python build.py")).toContain("over the 1 MB limit");
		expect(await quotaMessage(directory, "rm -f big.bin")).toBeNull();
	});
	it("allows commands under the cap", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "quota-"));
		expect(await quotaMessage(directory, "ls")).toBeNull();
	});
});
