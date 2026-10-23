import { describe, expect, it, vi } from "vitest";

const exec = vi.hoisted(() => vi.fn());
vi.mock("@/lib/project-agent/runtime/sandbox", () => ({ execInSandbox: exec }));
import { runWait } from "@/lib/project-agent/runtime/wait-action";

const input = () => ({ chatId: "pat_aaaaaaaaaaaa", waited: { seconds: 0 } });

describe("wait with a broken check", () => {
	it.each([127, 2, 126])("returns at once when the check exits %i instead of waiting out the clock", async (code) => {
		exec.mockResolvedValue({ output: "sh: 1: pgrep: not found", exitCode: code, timedOut: false });
		const started = Date.now();
		const result = await runWait(input(), { seconds: 300, until: "! pgrep -f job", every: 5 });
		expect(result.failed).toBe(true);
		expect(result.text).toContain("check command is broken");
		expect(Date.now() - started).toBeLessThan(1000);
	});
	it("still returns ready when the check succeeds and keeps waiting while it exits 1", async () => {
		exec.mockResolvedValueOnce({ output: "", exitCode: 1, timedOut: false }).mockResolvedValueOnce({ output: "done", exitCode: 0, timedOut: false });
		const result = await runWait(input(), { seconds: 10, until: "test -f /work/x", every: 2 });
		expect(result.failed).toBeUndefined();
		expect(result.text).toContain("Ready after");
	});
});
