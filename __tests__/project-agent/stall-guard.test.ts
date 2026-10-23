import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ callModel: vi.fn(), exec: vi.fn() }));
vi.mock("@/lib/project-agent/runtime/model", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/project-agent/runtime/model")>()), callRuntimeModel: mocks.callModel }));
vi.mock("@/lib/project-agent/runtime/outputs", () => ({ newOutputFiles: async () => [], checkHtmlPage: async () => "", storeWorkbookValues: async () => {} }));
vi.mock("@/lib/project-agent/task-store", () => ({ listProjectAgentTasks: async () => [], writeProjectAgentFile: vi.fn() }));
vi.mock("@/lib/project-agent/runtime/sandbox", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/project-agent/runtime/sandbox")>()), execInSandbox: mocks.exec }));

import { StallGuard, stallLimits } from "@/lib/project-agent/runtime/stall-guard";
import { runRuntimeAgent } from "@/lib/project-agent/runtime/run-agent";

const idle = { step: 1, elapsedMs: 0, waitedMs: 0, tokens: 0 };

describe("StallGuard", () => {
	it("nudges once on a repeated action and stops on the fifth", () => {
		const guard = new StallGuard();
		for (let i = 0; i < 2; i += 1) guard.noteAction("a", false);
		expect(guard.check(idle)).toEqual({});
		guard.noteAction("a", false);
		expect(guard.check(idle).nudge).toContain("same action 3 times");
		expect(guard.check(idle).nudge).toBeUndefined();
		guard.noteAction("a", false); guard.noteAction("a", false);
		expect(guard.check(idle).stop).toContain("5 times");
	});
	it("counts failures in a row and resets on success", () => {
		const guard = new StallGuard();
		for (let i = 0; i < 3; i += 1) guard.noteAction(`k${i}`, true);
		expect(guard.check(idle).nudge).toContain("3 actions in a row failed");
		guard.noteAction("ok", false);
		for (let i = 3; i < 8; i += 1) guard.noteAction(`k${i}`, true);
		expect(guard.check(idle).stop).toBeUndefined();
		guard.noteAction("k9", true);
		expect(guard.check(idle).stop).toContain("6 actions failed");
	});
	it("uses working time without the waits, tokens and steps", () => {
		const limits = stallLimits();
		const guard = new StallGuard();
		expect(guard.check({ ...idle, elapsedMs: limits.hardMs + 60_000, waitedMs: 120_000 }).stop).toBeUndefined();
		expect(guard.check({ ...idle, elapsedMs: limits.hardMs + 60_000 }).stop).toContain("minutes");
		expect(new StallGuard().check({ ...idle, tokens: limits.hardTokens }).stop).toContain("new tokens");
		expect(new StallGuard().check({ ...idle, step: limits.softSteps }).nudge).toContain("deliver what you have");
	});
});

describe("runRuntimeAgent stall stop", () => {
	it("asks for a final answer when the same failing action keeps coming, then ends with it", async () => {
		const shell = JSON.stringify({ action: "shell", command: "false" });
		const final = JSON.stringify({ action: "final", answer: "Blocked: the command keeps failing.", files: [] });
		let calls = 0;
		mocks.callModel.mockImplementation(async ({ query }: { query: string }) => ({ answer: ++calls <= 5 || !query.includes("STOP:") ? shell : final, conversationId: "c1", promptTokens: 1000 }));
		mocks.exec.mockResolvedValue({ output: "failed", exitCode: 1, timedOut: false });
		const result = await runRuntimeAgent({ chatId: "pat_bbbbbbbbbbbb", user: "u", query: "do it" });
		expect(result.answer).toContain("Blocked");
		expect(calls).toBeLessThan(10);
	});
	it("throws when the model ignores the stop request", async () => {
		mocks.callModel.mockImplementation(async () => ({ answer: JSON.stringify({ action: "shell", command: "false" }), conversationId: "c1", promptTokens: 1000 }));
		mocks.exec.mockResolvedValue({ output: "failed", exitCode: 1, timedOut: false });
		await expect(runRuntimeAgent({ chatId: "pat_cccccccccccc", user: "u", query: "do it" })).rejects.toThrow(/was stopped because/);
	});
});
