import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { allowedEngines, engineRefusal } from "@/lib/project-agent/runtime/engines";
import { applyNoteOps } from "@/lib/project-agent/agent-sources";

describe("engines", () => {
	it("allows only engines whose module the caller has", async () => {
		expect(await allowedEngines(async (module) => new Set([module]))).toEqual(["generate_image", "workspace_read", "workspace_commands", "workspace_view", "workspace_apply"]);
		expect(await allowedEngines(async () => new Set())).toEqual([]);
		expect(await allowedEngines(async () => null)).toEqual([]);
	});
	it("refuses a denied engine and lets everything through without an allowlist", () => {
		expect(engineRefusal([], "generate_image")).toMatch(/not available/);
		expect(engineRefusal(undefined, "generate_image")).toBeNull();
		expect(engineRefusal(["generate_image"], "generate_image")).toBeNull();
		expect(engineRefusal([], "shell")).toBeNull();
	});
});

it("does not add the same runbook line twice", () => {
	expect(applyNoteOps(["Lesson: a"], [{ op: "add", text: "lesson: A " }, { op: "add", text: "Lesson: b" }])).toEqual(["Lesson: a", "Lesson: b"]);
});

const dockerReady = (() => { try { execFileSync("docker", ["image", "inspect", "project-agent-sandbox:local"], { stdio: "ignore" }); return true; } catch { return false; } })();
describe.skipIf(!dockerReady)("read-only sandbox exec", () => {
	it("reads /work but cannot write to it", async () => {
		const { execInSandbox, stopSandbox } = await import("@/lib/project-agent/runtime/sandbox");
		const chat = `ro-test-${Date.now()}`;
		try {
			const write = await execInSandbox(chat, "echo hi > /work/outputs/x.txt && echo wrote", 30);
			expect(write.output).toContain("wrote");
			const ro = await execInSandbox(chat, "cat /work/outputs/x.txt; echo more > /work/outputs/y.txt; echo rc=$?; echo t > /tmp/z && echo tmp-ok", 30, true);
			expect(ro.output).toContain("hi");
			expect(ro.output).toContain("rc=1");
			expect(ro.output).toContain("tmp-ok");
			expect((await execInSandbox(chat, "ls /work/outputs", 30)).output).not.toContain("y.txt");
		} finally { await stopSandbox(chat); }
	}, 120_000);
});
