import { beforeEach, describe, expect, it, vi } from "vitest";

const exec = vi.hoisted(() => vi.fn());
vi.mock("@/lib/project-agent/runtime/sandbox", () => ({ execInSandbox: exec }));

import { MAX_TASK_WAIT_SECONDS, MAX_WAIT_SECONDS, parseWait, runWait } from "@/lib/project-agent/runtime/wait-action";
import { parseRuntimeActions } from "@/lib/project-agent/runtime/actions";
import { denyReason } from "@/lib/project-agent/runtime/policy";
import { parseBrowserAction } from "@/lib/project-agent/runtime/browser-agent/action-parser";
import { runtimeTaskInstructions } from "@/lib/project-agent/runtime/instructions";

describe("wait action", () => {
	beforeEach(() => { exec.mockReset(); vi.useRealTimers(); });
	it("parses seconds, caps them and validates the check", () => {
		expect(parseWait({ seconds: 600 })).toMatchObject({ seconds: MAX_WAIT_SECONDS, every: 5 });
		expect(parseWait({ seconds: 20, until: " test -f /work/a ", every: 1 })).toEqual({ seconds: 20, until: "test -f /work/a", every: 2 });
		expect(parseWait({ seconds: 0 })).toMatchObject({ error: expect.stringContaining("seconds") });
		expect(parseRuntimeActions('{"action":"wait","seconds":30,"until":"ls"}')).toEqual([{ action: "wait", seconds: 30, until: "ls", every: 5, note: undefined }]);
	});
	it("returns as soon as the check passes, without waiting the full time", async () => {
		exec.mockResolvedValueOnce({ output: "not yet", exitCode: 1 }).mockResolvedValueOnce({ output: "ok", exitCode: 0 });
		const waited = { seconds: 0 };
		const started = Date.now();
		const result = await runWait({ chatId: "c", waited }, { seconds: 120, until: "test -f /work/x", every: 2 });
		expect(result.text).toMatch(/^Ready after/);
		expect(exec).toHaveBeenCalledTimes(2);
		expect(Date.now() - started).toBeLessThan(5_000);
		expect(waited.seconds).toBeGreaterThanOrEqual(1);
	}, 15_000);
	it("reports an unmet check, honours stop, and enforces the task budget", async () => {
		exec.mockResolvedValue({ output: "still running", exitCode: 1 });
		const unmet = await runWait({ chatId: "c", waited: { seconds: 0 } }, { seconds: 2, until: "false", every: 2 });
		expect(unmet.text).toContain("still not satisfied");
		const controller = new AbortController(); controller.abort();
		expect((await runWait({ chatId: "c", signal: controller.signal, waited: { seconds: 0 } }, { seconds: 100, until: "false", every: 2 })).failed).toBe(true);
		const spent = await runWait({ chatId: "c", waited: { seconds: MAX_TASK_WAIT_SECONDS } }, { seconds: 5, every: 2 });
		expect(spent).toMatchObject({ failed: true });
	}, 15_000);
	it("applies shell policy to the check command and lets reviewers wait", () => {
		expect(denyReason({}, { action: "wait", seconds: 5, every: 5, until: "rm -rf /work" })).toMatch(/^Policy:/);
		expect(denyReason({}, { action: "wait", seconds: 5, every: 5, until: "test -f /work/a" })).toBeNull();
		expect(denyReason({ readOnly: true }, { action: "browser", op: "wait", find: "x" } as never)).toBeNull();
	});
	it("adds a browser wait op and teaches the agent to wait instead of polling", () => {
		expect(parseBrowserAction({ op: "wait", find: "Done", seconds: 99 })).toMatchObject({ op: "wait", seconds: 30, find: "Done" });
		expect(runtimeTaskInstructions()).toContain('"action":"wait"');
		expect(runtimeTaskInstructions()).toContain("nohup");
	});
});
